"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

// Import the server action from our item actions module.
import { manageItemAction } from "@/app/(web)/(admin)/item/actions.js";

// Import our shared popup components.
import Popup from "@/ui/Popup.js";
import InformationPopup from "@/ui/InformationPopup.js";

// Client-side Zod schema for basic field validation.
const ClientItemSchema = z.object({
  name: z.string().min(1, "Name required"),
  typeId: z.coerce.number().int().positive("Type is required"),
  describe: z.string().max(10000, "Description too long").optional(),
  point: z.coerce.number().int().gt(0, "Point must be > 0"),
});

export default function ManageItemWrapper({ item }) {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Form State Initialization
  // ---------------------------------------------------------------------------
  const [name, setName] = useState(item.name || "");
  const [typeId, setTypeId] = useState(item.typeId || 0);
  const [describe, setDescribe] = useState(item.describe || "");
  const [point, setPoint] = useState(item.point || 0);
  const [status, setStatus] = useState(item.status || "show");

  // Image management state.
  const [images, setImages] = useState(
    item.images ? [...item.images].sort((a, b) => a.order - b.order) : []
  );
  const [removedImages, setRemovedImages] = useState([]);
  const [newImages, setNewImages] = useState([]);

  // ---------------------------------------------------------------------------
  // UI State: errors, loading, and popups.
  // ---------------------------------------------------------------------------
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Concurrency confirmation popup state.
  const [concurrencyOpen, setConcurrencyOpen] = useState(false);
  const [requiredAction, setRequiredAction] = useState(null);
  const [inHandList, setInHandList] = useState([]);
  const [pendingList, setPendingList] = useState([]);

  // Deletion confirmation popup (simple confirm without a reason).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Information popup state.
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState("Result");
  const [infoMessage, setInfoMessage] = useState("");

  // ---------------------------------------------------------------------------
  // Field Validation Helpers (using Zod)
  // ---------------------------------------------------------------------------
  function validateField(fieldName, value) {
    const shape = { [fieldName]: ClientItemSchema.shape[fieldName] };
    const partialSchema = z.object(shape);
    const result = partialSchema.safeParse({ [fieldName]: value });
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
      case "typeId":
        setTypeId(Number(value));
        break;
      case "describe":
        setDescribe(value);
        break;
      case "point":
        setPoint(Number(value));
        break;
      default:
        break;
    }
    validateField(fieldName, value);
  }

  // ---------------------------------------------------------------------------
  // Image Management Functions
  // ---------------------------------------------------------------------------
  function removeImage(imagePath) {
    setImages((prev) => prev.filter((img) => img.path !== imagePath));
    setRemovedImages((prev) => [...prev, imagePath]);
  }

  function moveImageUp(index) {
    if (index === 0) return;
    setImages((prev) => {
      const newArr = [...prev];
      [newArr[index - 1], newArr[index]] = [newArr[index], newArr[index - 1]];
      return newArr;
    });
  }

  function moveImageDown(index) {
    if (index === images.length - 1) return;
    setImages((prev) => {
      const newArr = [...prev];
      [newArr[index], newArr[index + 1]] = [newArr[index + 1], newArr[index]];
      return newArr;
    });
  }

  function handleNewImage(e) {
    const files = e.target.files;
    if (!files.length) return;
    setNewImages((prev) => [...prev, ...Array.from(files)]);
    // New images can be uploaded in handleUpdate if we code that logic.
  }

  // ---------------------------------------------------------------------------
  // Popup Helpers
  // ---------------------------------------------------------------------------
  function showInfoPopup(title, message) {
    setInfoTitle(title);
    setInfoMessage(message);
    setInfoOpen(true);
  }

  function handleServerResult(result) {
    if (!result) {
      showInfoPopup("Error", "No response from server");
      return;
    }
    if (result.ok) {
      showInfoPopup("Success", "Operation succeeded!");
      if (result.newStatus) setStatus(result.newStatus);
      return;
    }
    if (result.concurrency) {
      const { requiredAction = "", inHand = [], pending = [] } = result;
      setInHandList(inHand);
      setPendingList(pending);
      if (requiredAction.startsWith("CANNOT_") || requiredAction === "RETRY") {
        const msg = `Operation blocked.\n\nIn-Hand Orders: ${inHand.join(
          ", "
        )}\nPending Orders: ${pending.join(", ")}\nAction: ${requiredAction}`;
        showInfoPopup("Concurrency Blocked", msg);
        return;
      }
      setRequiredAction(requiredAction);
      setConcurrencyOpen(true);
      return;
    }
    if (result.fieldErrors) {
      let msg = "Server Validation Errors:\n";
      for (const [fld, errs] of Object.entries(result.fieldErrors)) {
        msg += `${fld}: ${errs.join(", ")}\n`;
      }
      showInfoPopup("Error", msg);
      return;
    }
    if (result.error) {
      showInfoPopup("Error", result.error);
      return;
    }
    showInfoPopup("Error", "Unknown server response");
  }

  // ---------------------------------------------------------------------------
  // Action Handlers: Update, ToggleHide, Maintenance, Delete
  // ---------------------------------------------------------------------------
  async function handleUpdate(e) {
    e.preventDefault();
    const check = ClientItemSchema.safeParse({ name, typeId, describe, point });
    if (!check.success) {
      let errMsg = "";
      check.error.issues.forEach((i) => {
        errMsg += `${i.path.join(".")}: ${i.message}\n`;
      });
      showInfoPopup("Validation Error", errMsg);
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        itemId: item.id,
        action: "update",
        name,
        typeId,
        describe,
        point,
        imageOrder: images.map((img) => img.path),
        removedImages,
      };
      const result = await manageItemAction(payload);
      handleServerResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleHide() {
    setIsLoading(true);
    try {
      const payload = {
        itemId: item.id,
        action: "toggleHide",
      };
      const result = await manageItemAction(payload);
      handleServerResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMaintenance() {
    setIsLoading(true);
    try {
      const payload = {
        itemId: item.id,
        action: "maintenance",
      };
      const result = await manageItemAction(payload);
      handleServerResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  function openDeleteConfirmPopup() {
    setDeleteConfirmOpen(true);
  }
  function cancelDeleteConfirm() {
    setDeleteConfirmOpen(false);
  }
  async function confirmDelete() {
    setDeleteConfirmOpen(false);
    setIsLoading(true);
    try {
      const payload = {
        itemId: item.id,
        action: "delete",
        confirmCancel: true,
      };
      const result = await manageItemAction(payload);
      handleServerResult(result);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConcurrencyConfirm() {
    setConcurrencyOpen(false);
    setIsLoading(true);
    try {
      let actionToResend;
      if (requiredAction === "MAINTENANCE") {
        actionToResend = "maintenance";
      } else if (requiredAction === "DELETE_ITEM") {
        actionToResend = "delete";
      } else {
        actionToResend = "update";
      }
      const payload = {
        itemId: item.id,
        action: actionToResend,
        confirmCancel: true,
        name,
        typeId,
        describe,
        point,
        imageOrder: images.map((img) => img.path),
        removedImages,
      };
      const result = await manageItemAction(payload);
      handleServerResult(result);
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

  // ---------------------------------------------------------------------------
  // Render UI
  // ---------------------------------------------------------------------------
  return (
    <div style={{ padding: "1rem" }}>
      <h2>Manage Item: {item.id}</h2>
      <form onSubmit={handleUpdate}>
        <div>
          <label>Item ID:</label>
          <input type="text" readOnly value={item.id} />
        </div>
        <div>
          <label>Current Status:</label>
          <input type="text" readOnly value={status} />
        </div>
        <div>
          <label>Name:</label>
          <input
            value={name}
            onChange={(e) => handleFieldChange("name", e.target.value)}
          />
          {errors.name && <p style={{ color: "red" }}>{errors.name}</p>}
        </div>
        <div>
          <label>Type ID:</label>
          <select
            value={typeId}
            onChange={(e) => handleFieldChange("typeId", e.target.value)}
          >
            <option value="0" disabled>
              Select Type
            </option>
            {/* Replace with real type ID options from "type" table, if needed */}
            <option value="1">Type #1</option>
            <option value="2">Type #2</option>
            <option value="3">Type #3</option>
          </select>
          {errors.typeId && <p style={{ color: "red" }}>{errors.typeId}</p>}
        </div>
        <div>
          <label>Description (Markdown):</label>
          <textarea
            value={describe}
            onChange={(e) => handleFieldChange("describe", e.target.value)}
            rows="6"
          />
          {errors.describe && (
            <p style={{ color: "red" }}>{errors.describe}</p>
          )}
        </div>
        <div>
          <label>Point (Cost):</label>
          <input
            type="number"
            value={point}
            onChange={(e) => handleFieldChange("point", e.target.value)}
          />
          {errors.point && <p style={{ color: "red" }}>{errors.point}</p>}
        </div>

        {/* Image Gallery Section */}
        <div>
          <h3>Images</h3>
          {images.length === 0 ? (
            <p>No images available.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {images.map((img, index) => (
                <li
                  key={img.path}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <img
                    src={img.path}
                    alt={`Item image ${index + 1}`}
                    style={{ width: "100px", height: "auto", marginRight: "1rem" }}
                  />
                  <div>
                    <button
                      type="button"
                      onClick={() => moveImageUp(index)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImageDown(index)}
                      disabled={index === images.length - 1}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => removeImage(img.path)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label>Add New Images:</label>
            <input type="file" multiple onChange={handleNewImage} />
          </div>
        </div>

        <button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Changes"}
        </button>
      </form>

      <hr />

      <div style={{ marginTop: "1rem" }}>
        <button onClick={handleToggleHide} disabled={isLoading}>
          Toggle Show/Hide
        </button>
        <button onClick={handleMaintenance} disabled={isLoading}>
          Set Maintenance
        </button>
        <button
          onClick={openDeleteConfirmPopup}
          style={{ color: "red" }}
          disabled={isLoading}
        >
          Delete Item
        </button>
      </div>

      {/* Concurrency Confirmation Popup */}
      <Popup
        isOpen={concurrencyOpen}
        title="Concurrency Detected"
        confirmText="Proceed"
        cancelText="Cancel"
        onConfirm={handleConcurrencyConfirm}
        onCancel={handleConcurrencyCancel}
      >
        <div style={{ whiteSpace: "pre-wrap" }}>
          <p>In-Hand Orders: {inHandList.join(", ") || "(none)"}</p>
          <p>Pending Orders: {pendingList.join(", ") || "(none)"}</p>
          <p>
            Required Action: <strong>{requiredAction}</strong>. Proceed?
          </p>
        </div>
      </Popup>

      {/* Deletion Confirmation Popup */}
      <Popup
        isOpen={deleteConfirmOpen}
        title="Confirm Deletion"
        confirmText="Yes, Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={cancelDeleteConfirm}
      >
        <p>
          Are you sure you want to permanently delete this item and all its
          images?
        </p>
      </Popup>

      {/* Information Popup for success or errors */}
      <InformationPopup
        isOpen={infoOpen}
        title={infoTitle}
        onClose={() => setInfoOpen(false)}
      >
        {infoTitle.toLowerCase().includes("error") ||
        infoTitle.toLowerCase().includes("blocked") ? (
          <p style={{ color: "red", whiteSpace: "pre-wrap" }}>{infoMessage}</p>
        ) : (
          <p style={{ color: "green", whiteSpace: "pre-wrap" }}>{infoMessage}</p>
        )}
      </InformationPopup>
    </div>
  );
}
