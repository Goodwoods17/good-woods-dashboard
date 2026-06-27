/**
 * Minimal TypeScript declarations for frappe-gantt (MIT).
 * Full API: https://frappe.io/gantt
 */

declare module "frappe-gantt" {
  export interface GanttTask {
    id: string;
    name: string;
    start: string; // YYYY-MM-DD
    end: string; // YYYY-MM-DD (inclusive — frappe-gantt adds 1 day internally)
    progress: number; // 0–100
    dependencies?: string; // comma-separated task ids
    custom_class?: string;
    [key: string]: unknown;
  }

  export interface GanttOptions {
    view_mode?: "Day" | "Week" | "Month" | "Year" | string;
    date_format?: string;
    bar_height?: number;
    padding?: number;
    readonly?: boolean;
    readonly_dates?: boolean;
    readonly_progress?: boolean;
    move_dependencies?: boolean;
    language?: string;
    lines?: "vertical" | "horizontal" | "both" | "none";
    today_button?: boolean;
    scroll_to?: string | null;
    on_click?: (task: GanttTask) => void;
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
    on_view_change?: (mode: string) => void;
    popup?: false | ((ctx: { task: GanttTask; set_title: (s: string) => void; set_subtitle: (s: string) => void; set_details: (s: string) => void }) => void);
  }

  export default class Gantt {
    constructor(
      element: string | HTMLElement | SVGElement,
      tasks: GanttTask[],
      options?: GanttOptions
    );
    refresh(tasks: GanttTask[]): void;
    change_view_mode(mode: string): void;
    destroy(): void;
  }
}
