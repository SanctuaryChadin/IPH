
import { pool } from '../lib/db.js';       // your pg Pool
import { z } from 'zod';

const createTaskSchema = z.object({
  email_case: z.string(),
  recipient: z.string().email(),
  variables: z.record(z.any()).optional()
});

export async function queueEmailTask(data) {
  // Validate input
  const parsed = createTaskSchema.parse(data);

  // Insert a row into tasks
  const { email_case, recipient, variables } = parsed;
  await pool.query(
    `
    INSERT INTO tasks (type, status, "emailCase", "recipientEmail", variables)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [
      'email',           // type
      'pending',         // status
      email_case,
      recipient,
      variables ? JSON.stringify(variables) : '{}'
    ]
  );

  // Return or do further logic
  return { success: true };
}
