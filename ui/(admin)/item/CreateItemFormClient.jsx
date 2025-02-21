// ui/(admin)/item/CreateItemFormClient.jsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createItemAction } from "@/app/(web)/(admin)/item/actions.js";

export default function CreateItemFormClient() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("0");
  const [point, setPoint] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("typeId", typeId);
      formData.append("point", point);

      const result = await createItemAction(formData);

      if (!result.ok) {
        setError("Failed to create item");
      } else {
        router.push(`/item/manage/${result.newId}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ marginBottom: "1rem", border: "1px solid #ccc", padding: "1rem" }}
    >
      <h3>Create Item</h3>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div>
        <label>Name: </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div>
        <label>Type ID: </label>
        <input
          type="number"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          min="1"
        />
      </div>

      <div>
        <label>Point: </label>
        <input
          type="number"
          value={point}
          onChange={(e) => setPoint(e.target.value)}
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create Item"}
      </button>
    </form>
  );
}
