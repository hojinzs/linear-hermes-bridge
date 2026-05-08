import { Badge } from "@mantine/core";

const COLOR: Record<string, string> = {
  queued: "gray",
  claimed: "blue",
  running: "blue",
  awaiting_input: "yellow",
  succeeded: "green",
  failed: "red",
  canceled: "orange",
  timed_out: "red",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge color={COLOR[status] ?? "gray"}>{status}</Badge>;
}
