#!/usr/bin/env node
/**
 * automation.js
 * 
 * Run with a cronjob in Ubuntu, for example:
 *    * * * * * flock -n /tmp/iph_automation.lock node /path/to/automation.js >> /path/to/cron.log 2>&1
 * This ensures only one instance runs at a time (via OS-level flock).
 */
import dotenv from 'dotenv';
dotenv.config(); // อ่านไฟล์ .env

import dayjs from 'dayjs';

import {pool} from './lib/db.js'; 
import { sendEmailByCase } from './lib/email/sendEmail.js'; 

console.log(process.env.SMTP_HOST, process.env.SMTP_PORT);
// --------------------------
// 1. Toggling On/Off 
// --------------------------
const ENABLE_ORDER_UPDATES = false;   // or false if not ready
const ENABLE_EMAIL_PROCESSING = true;
const ENABLE_LOG_CLEANUP = false;

// For log cleanup settings
const LOG_RETENTION_DAYS = 7; 
const CLEANUP_START_HOUR = 2;
const CLEANUP_WINDOW_MINUTES = 30;

// Batch limit for email tasks
const BATCH_LIMIT = 10;

// --------------------------
// 2. Logging Utility
// --------------------------
async function logSystemActivity(systemType, description) {
  try {
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
    await pool.query(`
      INSERT INTO "systemLog" ("timestamp", "type", "describe")
      VALUES ($1, $2, $3)
    `, [now, systemType, description]);
  } catch (err) {
    console.error('Error logging system activity:', err.message);
  }
}

// --------------------------
// 3. Order Status Updates 
// (Replicate your SQL logic from PHP)
// --------------------------
async function updateOrderStatuses() {
  if (!ENABLE_ORDER_UPDATES) {
    await logSystemActivity('Info', 'Order updates disabled (ENABLE_ORDER_UPDATES=false)');
    return;
  }

  let client;
  try {
    client = await pool.connect();

    // 1) select orders ที่เข้าข่าย
    const res1 = await client.query(`
      SELECT RO.Order_ID, AI.Name AS ClientName, ...
      FROM reservation_order RO
        JOIN account_information AI ON ...
      WHERE RO.Status = 'pending'
        AND RO.Place_Order_Date_Time < (NOW() - INTERVAL '48 hours')
      ORDER BY RO.Order_ID ASC
    `);

    // 2) วนลูปทำงานต่อ order
    for (let row of res1.rows) {
      try {
        await client.query('BEGIN');
        
        const orderId = row.order_id;
        // update status
        const updRes = await client.query(`
          UPDATE reservation_order
          SET Status = 'cancel'
          WHERE Order_ID = $1
            AND Status = 'pending'
        `, [orderId]);

        if (updRes.rowCount > 0) {
          // refund point
          const updQuery = `
            UPDATE account_information AS AI
            SET Point = COALESCE(AI.Point, 0) + RO.Reserve_Point,
                Points_Refunded = 1
            FROM reservation_order AS RO
            WHERE AI.Account_ID = RO.Client_ID
              AND RO.Order_ID = $1
              AND AI.Role = 'user'
              AND RO.Status = 'cancel'
              AND RO.Points_Refunded = 0
          `;
          await client.query(updQuery, [orderId]);

          // queue email
          const reason = 'Your order is not accepted within 48 hours after place order auto-cancel.';
          await queueEmailTask(
            'reservation_request_reject',
            row.clientemail,
            {
              name: row.clientname,
              itemName: row.item_name,
              reason,
              receiveDate: row.receive_date,
            },
            client
          );

          // log
          await logSystemActivity('Cancel', `Canceled old pending order #${orderId}. Email queued.`);
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error; 
      }
    }

  } catch (err) {
    // ถ้า throw ออกจากลูป เราจะมา catch ตรงนี้
    await logSystemActivity('Error', `Error updating order statuses: ${err.message}`);
    console.error('updateOrderStatuses error:', err);
  } finally {
    if (client) {
      client.release(); 
    }
  }
}


// --------------------------
// 4. Queueing an Email Task 
// (Insert into your "tasks" table, like your old sendEmailTask in PHP)
// --------------------------
async function queueEmailTask(emailCase, recipient, variables, clientOrPool) {
  const db = clientOrPool || pool; // optionally use an existing transaction client
  const jsonVars = JSON.stringify(variables || {});
  try {
    await db.query(`
      INSERT INTO tasks (type, status, "emailCase", "recipientEmail", variables)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      'email',    // type
      'pending',  // status
      emailCase,
      recipient,
      jsonVars
    ]);
    await logSystemActivity('TaskCreation', `Created email task ${emailCase} for ${recipient}`);
  } catch (err) {
    await logSystemActivity('Error', `Failed to create email task for ${recipient}: ${err.message}`);
  }
}

// --------------------------
// 5. Process Email Tasks 
// --------------------------
async function processEmailTasks() {
  if (!ENABLE_EMAIL_PROCESSING) {
    await logSystemActivity('Info', 'Email processing disabled (ENABLE_EMAIL_PROCESSING=false)');
    return;
  }

  let client;
  try {
    client = await pool.connect();

    // 1) find pending email tasks (auto-commit mode, no BEGIN here)
    const { rows: tasks } = await client.query(`
      SELECT *
      FROM tasks
      WHERE type='email'
        AND status='pending'
      ORDER BY id ASC
      LIMIT $1
    `, [BATCH_LIMIT]);

    if (!tasks.length) {
      await logSystemActivity('EmptyTask', 'No pending email tasks found.');
      return; // <-- no transaction to commit
    }

    // 2) Loop through each pending task
    for (let task of tasks) {
      const taskID = task.id;
      let variables = {};

      try {
        // Start a transaction just for this single task
        await client.query('BEGIN');

        // Parse JSON variables if any
        try {
          variables = task.variables ? task.variables : {};
        } catch (parseErr) {
          throw new Error(`JSON parse error for task #${taskID}: ${parseErr.message}`);
        }

        // Validate required fields
        const emailCase = task.emailCase;
        const recipientEmail = task.recipientEmail;
        if (!recipientEmail) {
          throw new Error(`No recipient email for task #${taskID}`);
        }

        // 3) Actually send the email (like "sendEmailByCase")
        await sendEmailByCase(emailCase, recipientEmail, variables);

        // 4) If successful, mark completed
        await client.query(`
          UPDATE tasks
          SET status='completed',
              attempts = attempts + 1,
              "updateAt" = NOW()
          WHERE id = $1
        `, [taskID]);

        await logSystemActivity('Complete', `Sent email task #${taskID} to ${recipientEmail}`);

        // 5) Commit the transaction for this task
        await client.query('COMMIT');
        
      } catch (err) {
        // If *any* step above fails, rollback this task’s transaction
        console.error(`Error in processEmailTasks for task #${taskID}:`, err);
        try {
          await client.query('ROLLBACK');
        } catch (rbErr) {
          console.error('Rollback error:', rbErr);
        }

        // Mark the task as failed in auto-commit mode
        // (We do this *after* rollback so we don’t keep the DB in an aborted tx state)
        await failTask(client, taskID, err.message);

        await logSystemActivity('Error', `Task #${taskID} rolled back. Reason: ${err.message}`);
      }
    }

  } catch (err) {
    // If something big happens outside the loop
    console.error('processEmailTasks fatal error:', err);
    await logSystemActivity('Error', `processEmailTasks error: ${err.message}`);
  } finally {
    // Release the client back to the pool
    if (client) client.release();
  }
}

// helper to fail a task
async function failTask(db, taskID, reason) {
  await db.query(`
    UPDATE tasks
    SET status='failed',
        attempts = attempts + 1,
        "updateAt" = NOW()
    WHERE id = $1
  `, [taskID]);
  await logSystemActivity('Failed', `Task #${taskID} failed. Reason: ${reason}`);
}

// --------------------------
// 6. Cleanup System Logs 
// (like "cleanupSystemLogs" in PHP)
// --------------------------
async function cleanupSystemLogs() {
  if (!ENABLE_LOG_CLEANUP) {
    await logSystemActivity('Info', 'Cleanup disabled (ENABLE_LOG_CLEANUP=false)');
    return;
  }

  // only do it if time is within a window
  const now = dayjs();
  const hour = now.hour();
  const minute = now.minute();
  if (hour === CLEANUP_START_HOUR && minute >= 0 && minute < CLEANUP_WINDOW_MINUTES) {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // check if cleanup done today
      const todayStr = now.format('YYYY-MM-DD');
      const { rows } = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM "systemLog"
        WHERE "type"='Cleanup'
          AND DATE("timestamp")=$1
      `, [todayStr]);
      const already = rows?.[0]?.count || 0;
      if (already > 0) {
        await client.query('ROLLBACK');
        return;
      }

      // do cleanup 
      const cutoffDate = now.subtract(LOG_RETENTION_DAYS, 'day').format('YYYY-MM-DD');
      const delRes = await client.query(`
        DELETE FROM "systemLog"
        WHERE DATE("timestamp") < $1
      `, [cutoffDate]);

      const deletedCount = delRes.rowCount;
      await logSystemActivity('Cleanup', `Deleted ${deletedCount} logs older than ${LOG_RETENTION_DAYS} days.`);
      await client.query('COMMIT');
    } catch (err) {
      if (client) {
        await client.query('ROLLBACK');
      }
      await logSystemActivity('Error', `Failed to clean up logs: ${err.message}`);
    } finally {
      if (client) client.release();
    }
  }
}

// --------------------------
// 7. Main Orchestrator 
// (Like runAutomation in PHP)
// --------------------------
async function runAutomation() {
  await updateOrderStatuses();
  await processEmailTasks();
  await cleanupSystemLogs();
}

// --------------------------
// 8. Execute if called from CLI
//   (Cron + flock runs this file)
// --------------------------
(async function main() {
  try {
    await logSystemActivity('Runscript', 'Automation script started.');
    await runAutomation();
    await logSystemActivity('Close', 'Automation script finished successfully.');
  } catch (err) {
    console.error('Main automation error:', err);
    await logSystemActivity('Error', `Automation top-level error: ${err.message}`);
  } finally {
    // optionally end the pool so Node exits
    await pool.end();
    process.exit(0);
  }
})();
