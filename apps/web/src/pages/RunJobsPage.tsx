import {
  Alert,
  Button,
  Code,
  Drawer,
  Group,
  Stack,
  Table,
  Text,
  Timeline,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

type JobRow = {
  id: string;
  agentId: string;
  status: string;
  triggerType: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

type EventRow = {
  id: string;
  eventType: string;
  sequence: number;
  payload: unknown;
  createdAt: string;
};

export function RunJobsPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ job: JobRow; events: EventRow[] } | null>(null);

  async function load() {
    try {
      const r = (await api.runJobs.list()) as { jobs: JobRow[] };
      setJobs(r.jobs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function openJob(id: string) {
    setOpen(id);
    try {
      const r = (await api.runJobs.get(id)) as { job: JobRow; events: EventRow[] };
      setDetail(r);
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }

  async function cancelJob(id: string) {
    try {
      await api.runJobs.cancel(id);
      notifications.show({ color: "green", message: "Cancel requested" });
      await load();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Run Jobs</Title>
        <Button variant="default" onClick={load} leftSection={<IconRefresh size={16} />}>
          Refresh
        </Button>
      </Group>
      {error && (
        <Alert color="red" icon={<IconInfoCircle size={16} />}>
          {error}
        </Alert>
      )}
      {jobs && jobs.length === 0 && <Text c="dimmed">No run jobs yet. Run pnpm smoke.</Text>}
      {jobs && jobs.length > 0 && (
        <Table striped withTableBorder highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Trigger</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Attempts</Table.Th>
              <Table.Th>Updated</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((j) => (
              <Table.Tr key={j.id} style={{ cursor: "pointer" }} onClick={() => openJob(j.id)}>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {j.id}
                  </Text>
                </Table.Td>
                <Table.Td>{j.triggerType}</Table.Td>
                <Table.Td>
                  <StatusBadge status={j.status} />
                </Table.Td>
                <Table.Td>{j.attemptCount}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(j.updatedAt).toLocaleString()}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Drawer
        opened={open !== null}
        onClose={() => {
          setOpen(null);
          setDetail(null);
        }}
        position="right"
        size="lg"
        title={detail ? `Run job ${detail.job.id}` : "Loading…"}
      >
        {detail && (
          <Stack>
            <Group>
              <StatusBadge status={detail.job.status} />
              {!["succeeded", "failed", "canceled"].includes(detail.job.status) && (
                <Button color="red" variant="light" onClick={() => cancelJob(detail.job.id)}>
                  Cancel
                </Button>
              )}
            </Group>
            <Title order={5}>Events</Title>
            <Timeline active={detail.events.length - 1} bulletSize={16}>
              {detail.events.map((e) => (
                <Timeline.Item key={e.id} title={e.eventType}>
                  <Text size="xs" c="dimmed">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </Text>
                  <Code block>{JSON.stringify(e.payload, null, 2)}</Code>
                </Timeline.Item>
              ))}
            </Timeline>
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
