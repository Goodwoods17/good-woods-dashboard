"use client";

import { Plus, Trash2 } from "lucide-react";
import { formatCAD } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { Room } from "@features/estimator/lib/types";
import { newRoom } from "@features/estimator/lib/types";

export function RoomsPanel({
  rooms,
  perRoom,
  onChange,
}: {
  rooms: Room[];
  perRoom: Record<string, { cost: number; price: number; lineCount: number }>;
  onChange: (next: Room[]) => void;
}) {
  function addRoom() {
    const placeholder = nextRoomName(rooms);
    onChange([...rooms, newRoom(placeholder)]);
  }
  function updateRoom(id: string, patch: Partial<Room>) {
    onChange(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRoom(id: string) {
    onChange(rooms.filter((r) => r.id !== id));
  }

  return (
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-muted flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Rooms</h2>
        <span className="text-xs text-text-tertiary">
          Tag lines with a room. Toggle a room off to remove its contribution.
        </span>
      </div>
      <div className="p-4 space-y-2">
        {rooms.length === 0 && (
          <p className="text-xs text-text-tertiary italic">
            No rooms yet. The whole job is one quote. Add a room to break things
            down (kitchen, bath, etc.) and toggle them in/out for scope changes.
          </p>
        )}
        {rooms.map((room) => {
          const stats = perRoom[room.id] ?? { price: 0, lineCount: 0 };
          return (
            <div
              key={room.id}
              className={cn(
                "grid items-center gap-3 px-3 py-2 rounded-md border border-border bg-surface-muted/40",
                !room.enabled && "opacity-60",
              )}
              style={{ gridTemplateColumns: "auto 1fr auto auto auto" }}
            >
              <Toggle
                on={room.enabled}
                onChange={(next) => updateRoom(room.id, { enabled: next })}
              />
              <input
                type="text"
                value={room.name}
                onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                className="text-sm bg-transparent border-0 px-1 py-0.5 focus:outline-none focus:bg-surface focus:border focus:border-border focus:rounded"
              />
              <span className="text-caption text-text-tertiary tabular-nums">
                {stats.lineCount} line{stats.lineCount === 1 ? "" : "s"}
              </span>
              <span className="text-sm tabular-nums text-text-secondary font-medium min-w-[5.5rem] text-right">
                {formatCAD(stats.price)}
              </span>
              <button
                onClick={() => removeRoom(room.id)}
                className="text-text-tertiary hover:text-status-blocked transition-colors duration-fast"
                aria-label={`Remove room ${room.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
        <button
          onClick={addRoom}
          className="w-full px-3 py-1.5 flex items-center justify-center gap-2 text-xs text-text-tertiary hover:text-accent hover:bg-accent-soft/30 transition-colors duration-fast border border-dashed border-border rounded-md"
        >
          <Plus className="h-3 w-3" strokeWidth={1.75} />
          Add room
        </button>
      </div>
    </section>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-fast",
        on ? "bg-accent" : "bg-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-fast",
          on ? "translate-x-3.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function nextRoomName(rooms: Room[]): string {
  const defaults = ["Kitchen", "Master bath", "Pantry", "Laundry", "Office"];
  for (const name of defaults) {
    if (!rooms.find((r) => r.name === name)) return name;
  }
  return `Room ${rooms.length + 1}`;
}
