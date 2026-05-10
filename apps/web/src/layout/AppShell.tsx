import { Burger, Group, AppShell as MantineAppShell, NavLink, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconList, IconRobot } from "@tabler/icons-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { DevBanner } from "../components/DevBanner";

export function AppShell() {
  const [opened, { toggle }] = useDisclosure();
  const loc = useLocation();
  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>Linear Hermes Bridge</Title>
          </Group>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Navbar p="xs">
        <NavLink
          component={Link}
          to="/agents"
          label="Agents"
          leftSection={<IconRobot size={16} />}
          active={loc.pathname.startsWith("/agents")}
        />
        <NavLink
          component={Link}
          to="/run-jobs"
          label="Run Jobs"
          leftSection={<IconList size={16} />}
          active={loc.pathname.startsWith("/run-jobs")}
        />
      </MantineAppShell.Navbar>
      <MantineAppShell.Main>
        <DevBanner />
        <div style={{ marginTop: 12 }}>
          <Outlet />
        </div>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
