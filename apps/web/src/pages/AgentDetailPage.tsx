import { Alert, Badge, Button, Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { type AgentListItem, api } from "../api/client";
import { CopyableUrl } from "../components/CopyableUrl";
import { StatusBadge } from "../components/StatusBadge";

type Installation = {
  id: string;
  organizationId: string;
  organizationName?: string | null;
  status: string;
  scopes: string[];
};

export function AgentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<AgentListItem | null>(null);
  const [installs, setInstalls] = useState<Installation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const r = await api.agents.get(slug);
      setAgent(r.agent);
      const inst = await api.installations.list(slug);
      setInstalls(inst.installations);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled() {
    if (!agent) return;
    if (agent.enabled) await api.agents.disable(agent.slug);
    else await api.agents.enable(agent.slug);
    await load();
  }

  async function testHermes() {
    if (!agent) return;
    try {
      const r = await api.agents.testHermes(agent.slug);
      notifications.show({
        color: r.ok ? "green" : "red",
        message: `${r.ok ? "OK" : "FAIL"} in ${r.latencyMs}ms`,
      });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }

  if (error)
    return (
      <Alert color="red" icon={<IconInfoCircle size={16} />}>
        {error}
      </Alert>
    );
  if (!agent) return <div>Loading…</div>;

  return (
    <Stack maw={760}>
      <Group justify="space-between">
        <Group>
          <Title order={2}>{agent.displayName}</Title>
          <StatusBadge status={agent.enabled ? "succeeded" : "canceled"} />
        </Group>
        <Group>
          <Button variant="default" onClick={toggleEnabled}>
            {agent.enabled ? "Disable" : "Enable"}
          </Button>
          <Button variant="light" onClick={testHermes}>
            Test Hermes
          </Button>
        </Group>
      </Group>
      <Card withBorder>
        <Title order={4} mb="sm">
          URLs
        </Title>
        <Stack gap="xs">
          <CopyableUrl label="Callback" url={agent.callbackUrl} />
          <CopyableUrl label="Webhook" url={agent.webhookUrl} />
          <CopyableUrl label="Install" url={agent.installUrl} />
        </Stack>
      </Card>
      <Card withBorder>
        <Title order={4} mb="sm">
          Linear installations
        </Title>
        {installs.length === 0 ? (
          <Text c="dimmed">No installations yet. Run pnpm dev:seed for a mock install.</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Organization</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Scopes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {installs.map((i) => (
                <Table.Tr key={i.id}>
                  <Table.Td>{i.organizationName ?? i.organizationId}</Table.Td>
                  <Table.Td>
                    <Badge>{i.status}</Badge>
                  </Table.Td>
                  <Table.Td>{i.scopes.join(", ")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
