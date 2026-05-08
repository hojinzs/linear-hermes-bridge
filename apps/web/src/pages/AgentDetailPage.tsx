import { Alert, Button, Card, Group, Stack, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { type AgentListItem, api } from "../api/client";
import { CopyableUrl } from "../components/CopyableUrl";
import { StatusBadge } from "../components/StatusBadge";

export function AgentDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<AgentListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const r = await api.agents.get(slug);
      setAgent(r.agent);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled() {
    if (!agent) return;
    try {
      if (agent.enabled) await api.agents.disable(agent.slug);
      else await api.agents.enable(agent.slug);
      await load();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }

  async function testHermes() {
    if (!agent) return;
    try {
      const r = await api.agents.testHermes(agent.slug);
      notifications.show({ color: "green", message: `OK in ${r.latencyMs}ms` });
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
    </Stack>
  );
}
