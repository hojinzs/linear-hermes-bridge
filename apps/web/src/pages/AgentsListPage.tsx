import { Alert, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { IconInfoCircle, IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type AgentListItem, api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";

export function AgentsListPage() {
  const [agents, setAgents] = useState<AgentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.agents
      .list()
      .then((r) => mounted && setAgents(r.agents))
      .catch((e) => mounted && setError((e as Error).message));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Agents</Title>
        <Button component={Link} to="/agents/new" leftSection={<IconPlus size={16} />}>
          New agent
        </Button>
      </Group>
      {error && (
        <Alert color="red" icon={<IconInfoCircle size={16} />}>
          {error}
        </Alert>
      )}
      {agents && agents.length === 0 && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} title="No agents yet">
          Run <code>pnpm dev:seed</code> from the repo root to create a mock agent, or click{" "}
          <strong>New agent</strong> to add one manually.
        </Alert>
      )}
      {agents && agents.length > 0 && (
        <Table striped withTableBorder highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Slug</Table.Th>
              <Table.Th>Display name</Table.Th>
              <Table.Th>Connector</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {agents.map((a) => (
              <Table.Tr
                key={a.slug}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  window.location.href = `/agents/${a.slug}`;
                }}
              >
                <Table.Td>
                  <Text ff="monospace">{a.slug}</Text>
                </Table.Td>
                <Table.Td>{a.displayName}</Table.Td>
                <Table.Td>{a.hermesConnectorType}</Table.Td>
                <Table.Td>
                  <StatusBadge status={a.enabled ? "succeeded" : "canceled"} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
