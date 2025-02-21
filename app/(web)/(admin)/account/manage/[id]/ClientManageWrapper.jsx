// app/(web)/(admin)/account/manage/[id]/ClientManageWrapper.jsx
"use client"; // Client Component

import { useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";

// This is your existing server action import:
import { manageAccountAction } from "@/app/(web)/(admin)/account/actions.js";

// Popups:
import Popup from "@/ui/Popup.js";
import InformationPopup from "@/ui/InformationPopup.js";
import ReasonAndCheckPopup from "@/ui/ReasonAndCheckPopup.js";

////////////////////////////////////////////////////////////////////////
// 1) Zod schema for local validation
////////////////////////////////////////////////////////////////////////
const ClientManageSchema = z.object({
  name: z.string().min(1, "Name required"),
  department: z.coerce.number().min(1, "Dept must be 1..14").max(14, "Dept must be 1..14"),
  year: z.coerce.number().min(1).max(8),
  phone: z.string().regex(/^[0-9]{10}$/, "Phone must be 10 digits"),
  lineId: z.string().max(32, "Line ID up to 32 chars"),
  address: z.string().optional(),
  note: z.string().optional(),

  // DB role: "user","courier","admin" (not "club"). We'll handle "club" as a separate boolean.
  role: z.enum(["user", "courier", "admin"]),
  point: z.coerce.number().min(0, "Points >= 0").optional(),
});

////////////////////////////////////////////////////////////////////////
// 2) Main Component
////////////////////////////////////////////////////////////////////////
export default function ManageClientWrapper({ account }) {
  const router = useRouter();

  // -------------------------------------------------------------------
  // State: Form Fields
  // -------------------------------------------------------------------
  const [name, setName] = useState(account.name || "");
  const [department, setDepartment] = useState(String(account.departmentId || ""));
  const [year, setYear] = useState(String(account.year || ""));
  const [phone, setPhone] = useState(account.phone || "");
  const [lineId, setLineId] = useState(account.lineId || "");
  const [address, setAddress] = useState(account.address || "");
  const [note, setNote] = useState(account.note || "");

  // "club" stored separately; DB sees role='user' + club=true
  const [club, setClub] = useState(!!account.club);

  // displayedRole => "user","club","courier","admin"
  const [displayedRole, setDisplayedRole] = useState(() => {
    if (account.role === "user" && account.club) {
      return "club";
    }
    return account.role;
  });

  // Points if user or club
  const isUserOrClub = displayedRole === "user" || displayedRole === "club";
  const [userPoint, setUserPoint] = useState(
    isUserOrClub ? String(account.point || "0") : "0"
  );

  // -------------------------------------------------------------------
  // State: Validation Errors & Popups
  // -------------------------------------------------------------------
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Info popup for success, general errors, or concurrency *block*
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState("Result");
  const [infoMessage, setInfoMessage] = useState("");

  // Concurrency confirm popup => only if "PROMOTE","DEMOTE","DELETE"
  const [concurrencyOpen, setConcurrencyOpen] = useState(false);
  const [requiredAction, setRequiredAction] = useState(null);
  const [inHandList, setInHandList] = useState([]);
  const [pendingList, setPendingList] = useState([]);

  // Deletion reason & ban
  const [deletePopupOpen, setDeletePopupOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBan, setDeleteBan] = useState(false);

  //--------------------------------------------------------------------
  // Helpers
  //--------------------------------------------------------------------
  function formatOrderArray(arr) {
    // arr might be [123,456] or [ {orderId,slotId}, {orderId,slotId} ]
    // We'll produce a string like "123,456" or "order#123(slot9),order#456(slot10)"
    if (!arr || !arr.length) return "(none)";

    // Check if it's an array of numbers/strings or objects:
    if (typeof arr[0] === "object" && arr[0] !== null) {
      // { orderId, slotId }
      return arr
        .map((obj) => {
          const oid = obj.orderId ?? "(no orderId)";
          const sid = obj.slotId ?? "(no slotId)";
          return `Order#${oid} (Slot ${sid})`;
        })
        .join(", ");
    } else {
      // assume array of IDs
      return arr.join(", ");
    }
  }

  // A function to show an info popup:
  function showInfoPopup(title, message) {
    setInfoTitle(title);
    setInfoMessage(message);
    setInfoOpen(true);
  }

  //--------------------------------------------------------------------
  // Local real-time validation
  //--------------------------------------------------------------------
  function validateField(fieldName, value) {
    let testValue = value;
    if (fieldName === "role" && value === "club") {
      testValue = "user"; // "club" => actual user for Zod
    }

    const shape = { [fieldName]: ClientManageSchema.shape[fieldName] };
    const partialSchema = z.object(shape);
    const result = partialSchema.safeParse({ [fieldName]: testValue });

    if (!result.success) {
      const msg = result.error.issues[0].message;
      setErrors((prev) => ({ ...prev, [fieldName]: msg }));
    } else {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[fieldName];
        return copy;
      });
    }
  }

  function handleFieldChange(fieldName, value) {
    switch (fieldName) {
      case "name":
        setName(value);
        break;
      case "department":
        setDepartment(value);
        break;
      case "year":
        setYear(value);
        break;
      case "phone":
        setPhone(value);
        break;
      case "lineId":
        setLineId(value);
        break;
      case "address":
        setAddress(value);
        break;
      case "note":
        setNote(value);
        break;
      case "role":
        if (value === "club") {
          setClub(true);
          setDisplayedRole("club");
        } else {
          setClub(false);
          setDisplayedRole(value);
        }
        break;
      case "point":
        setUserPoint(value);
        break;
      default:
        break;
    }

    validateField(fieldName, value);
  }

  //--------------------------------------------------------------------
  // handleServerResult => concurrency or block or success
  //--------------------------------------------------------------------
  function handleServerResult(result) {
    if (!result) {
      showInfoPopup("Error", "No response from server");
      return;
    }

    if (result.ok) {
      // success
      showInfoPopup("Success", "Operation succeeded!");
      return;
    }

    // If concurrency => check requiredAction
    if (result.concurrency) {
      const { requiredAction = "", inHand = [], pending = [] } = result;
      // store inHand/pending in state
      setInHandList(inHand);
      setPendingList(pending);

      if (
        requiredAction.startsWith("CANNOT_") ||
        requiredAction === "RETRY"
      ) {
        // BLOCK scenario => show info popup with "inHand/pending" but no "confirm"
        const inHandStr = formatOrderArray(inHand);
        const pendingStr = formatOrderArray(pending);
        const msg = `This operation is blocked.\n\nIn-Hand:\n${inHandStr}\n\nPending:\n${pendingStr}\n\nAction: ${requiredAction}`;
        showInfoPopup("Concurrency Blocked", msg);
        return;
      }

      // else => "DELETE","PROMOTE","DEMOTE" => open concurrency popup
      setRequiredAction(requiredAction);
      setConcurrencyOpen(true);
      return;
    }

    // If fieldErrors => show them
    if (result.fieldErrors) {
      let msg = "Server Validation:\n";
      for (const [fld, arr] of Object.entries(result.fieldErrors)) {
        msg += `${fld}: ${arr.join(", ")}\n`;
      }
      showInfoPopup("Error", msg);
      return;
    }

    // If general error => show it
    if (result.error) {
      showInfoPopup("Error", result.error);
      return;
    }

    // fallback
    showInfoPopup("Error", "Unknown server response");
  }

  //--------------------------------------------------------------------
  // handleUpdate => "update" action
  //--------------------------------------------------------------------
  async function handleUpdate(e) {
    e.preventDefault();

    let finalRole = displayedRole;
    let finalClub = club;
    if (displayedRole === "club") {
      finalRole = "user";
      finalClub = true;
    }

    // local validation with Zod
    const check = ClientManageSchema.safeParse({
      name,
      department,
      year,
      phone,
      lineId,
      address,
      note,
      role: finalRole,
      point: isUserOrClub ? userPoint : "0",
    });
    if (!check.success) {
      let errMsg = "";
      check.error.issues.forEach((i) => {
        errMsg += `${i.path.join(".")}: ${i.message}\n`;
      });
      showInfoPopup("Validation Error", errMsg);
      return;
    }

    // call server
    setIsLoading(true);
    try {
      const payload = {
        accountId: account.id,
        action: "update",
        name,
        department,
        year,
        phone,
        lineId,
        address,
        note,
        role: finalRole,
        point: isUserOrClub ? userPoint : "0",
        club: finalClub,
      };
      const result = await manageAccountAction(payload);
      handleServerResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  //--------------------------------------------------------------------
  // handleDelete => "delete" action, with reason+ban
  //--------------------------------------------------------------------
  function openDeletePopup() {
    if (account.role === "admin") {
      showInfoPopup("Blocked", "Cannot delete an admin. Demote first.");
      return;
    }
    setDeletePopupOpen(true);
  }
  function cancelDelete() {
    setDeletePopupOpen(false);
  }
  async function confirmDelete(reason, banChecked) {
    setDeletePopupOpen(false);
    setDeleteReason(reason);
    setDeleteBan(banChecked);

    setIsLoading(true);
    try {
      const payload = {
        accountId: account.id,
        action: "delete",
        banEmail: banChecked ? "true" : "",
        banReason: reason,
        note,
      };
      const result = await manageAccountAction(payload);
      handleServerResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  //--------------------------------------------------------------------
  // handleConcurrencyConfirm => user clicked "Proceed" on concurrency
  //--------------------------------------------------------------------
  async function handleConcurrencyConfirm() {
    setConcurrencyOpen(false);

    if (!requiredAction) return;

    setIsLoading(true);
    try {
      if (requiredAction === "DELETE") {
        // re-send delete with confirmCancel
        const payload = {
          accountId: account.id,
          action: "delete",
          confirmCancel: "true",
          banEmail: deleteBan ? "true" : "",
          banReason: deleteReason,
          note,
        };
        const result = await manageAccountAction(payload);
        handleServerResult(result);
        return;
      }

      if (requiredAction === "PROMOTE" || requiredAction === "DEMOTE") {
        let finalRole = displayedRole;
        let finalClub = club;
        if (displayedRole === "club") {
          finalRole = "user";
          finalClub = true;
        }
        const payload = {
          accountId: account.id,
          action: "update",
          name,
          department,
          year,
          phone,
          lineId,
          address,
          note,
          role: finalRole,
          point: isUserOrClub ? userPoint : "0",
          club: finalClub,
          confirmCancel: "true",
        };
        const result = await manageAccountAction(payload);
        handleServerResult(result);
      }
    } finally {
      setIsLoading(false);
    }
  }
  function handleConcurrencyCancel() {
    setConcurrencyOpen(false);
    setRequiredAction(null);
    setInHandList([]);
    setPendingList([]);
  }

  //--------------------------------------------------------------------
  // 8) Render
  //--------------------------------------------------------------------
  return (
    <div style={{ padding: "1rem" }}>
      <form onSubmit={handleUpdate}>
        <div>
          <label>Account ID:</label>
          <input type="text" readOnly value={account.id} />
        </div>

        <div>
          <label>Email:</label>
          <input type="text" readOnly value={account.email} />
        </div>

        {/* Name */}
        <div>
          <label>Name:</label>
          <input
            value={name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
          />
          {errors.name && <p style={{ color: "red" }}>{errors.name}</p>}
        </div>

        {/* Department */}
        <div>
          <label>Department:</label>
          <select
            value={department}
            onChange={(e) => handleFieldChange("department", e.target.value)}
          >
            <option value="" disabled>Select Dept</option>
            <option value="1">Chemical Engineering</option>
            <option value="2">Civil Engineering</option>
            <option value="3">Computer Engineering</option>
            <option value="4">Electrical Engineering</option>
            <option value="5">Environmental Engineering</option>
            <option value="6">Industrial Engineering</option>
            <option value="7">ISE</option>
            <option value="8">Mechanical Engineering</option>
            <option value="9">Mining and Petroleum</option>
            <option value="10">Nuclear Engineering</option>
            <option value="11">Survey Engineering</option>
            <option value="12">Water Resources Eng</option>
            <option value="13">Engineering</option>
            <option value="14">Partner</option>
          </select>
          {errors.department && (
            <p style={{ color: "red" }}>{errors.department}</p>
          )}
        </div>

        {/* Year */}
        <div>
          <label>Year(1..8):</label>
          <input
            type="number"
            value={year}
            onChange={(e) => handleFieldChange("year", e.target.value)}
          />
          {errors.year && <p style={{ color: "red" }}>{errors.year}</p>}
        </div>

        {/* Phone */}
        <div>
          <label>Phone(10 digits):</label>
          <input
            value={phone}
            onChange={(e) => handleFieldChange("phone", e.target.value)}
          />
          {errors.phone && <p style={{ color: "red" }}>{errors.phone}</p>}
        </div>

        {/* Line ID */}
        <div>
          <label>LineID:</label>
          <input
            value={lineId}
            onChange={(e) => handleFieldChange("lineId", e.target.value)}
          />
          {errors.lineId && <p style={{ color: "red" }}>{errors.lineId}</p>}
        </div>

        {/* Address */}
        <div>
          <label>Address:</label>
          <textarea
            value={address}
            onChange={(e) => handleFieldChange("address", e.target.value)}
          />
        </div>

        {/* Role + "club" UI */}
        <div>
          <label>Role:</label>
          <select
            value={displayedRole}
            onChange={(e) => handleFieldChange("role", e.target.value)}
          >
            <optgroup label="User">
              <option value="user">User</option>
              <option value="club">Club</option>
            </optgroup>
            <optgroup label="Staff">
              <option value="courier">Courier</option>
              <option value="admin">Admin</option>
            </optgroup>
          </select>
          {errors.role && <p style={{ color: "red" }}>{errors.role}</p>}
        </div>

        {/* Points if user/club */}
        {(displayedRole === "user" || displayedRole === "club") && (
          <div>
            <label>Points:</label>
            <input
              type="number"
              step="1"
              value={userPoint}
              onChange={(e) => handleFieldChange("point", e.target.value)}
            />
            {errors.point && <p style={{ color: "red" }}>{errors.point}</p>}
          </div>
        )}

        {/* Note */}
        <div>
          <label>Note:</label>
          <textarea
            value={note}
            onChange={(e) => handleFieldChange("note", e.target.value)}
          />
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Updating..." : "Update Account"}
        </button>
      </form>

      <hr />

      <button
        style={{ color: "red" }}
        disabled={isLoading || account.role === "admin"}
        onClick={openDeletePopup}
      >
        Delete Account
      </button>

      {/* ReasonAndCheckPopup for Deletion */}
      <ReasonAndCheckPopup
        isOpen={deletePopupOpen}
        checkboxLabel="Ban this email?"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        checkChildren={<p>Are you sure you want to ban this email?</p>}
      >
        <p>Deleting {account.email}. Please provide a reason:</p>
      </ReasonAndCheckPopup>

      {/* Concurrency Popup => for "PROMOTE","DEMOTE","DELETE" */}
      <Popup
        isOpen={concurrencyOpen}
        title="Concurrency Detected"
        confirmText="Proceed"
        cancelText="Cancel"
        onConfirm={handleConcurrencyConfirm}
        onCancel={handleConcurrencyCancel}
      >
        <div style={{ whiteSpace: "pre-wrap" }}>
          <p>In-Hand Orders: {formatOrderArray(inHandList)}</p>
          <p>Pending Orders: {formatOrderArray(pendingList)}</p>
          <p>Required Action: <strong>{requiredAction}</strong>. Proceed?</p>
        </div>
      </Popup>

      {/* Info Popup => for success, errors, or blocking concurrency */}
      <InformationPopup
        isOpen={infoOpen}
        title={infoTitle}
        onClose={() => setInfoOpen(false)}
      >
        {infoTitle.toLowerCase().includes("error") || infoTitle.toLowerCase().includes("blocked") ? (
          <p style={{ color: "red", whiteSpace: "pre-wrap" }}>{infoMessage}</p>
        ) : (
          <p style={{ color: "green", whiteSpace: "pre-wrap" }}>{infoMessage}</p>
        )}
      </InformationPopup>
    </div>
  );
}
