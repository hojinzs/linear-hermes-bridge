import { Center, MantineProvider, Text } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

export function App() {
  return (
    <MantineProvider>
      <Notifications />
      <Center h="100vh">
        <Text>Linear Hermes Bridge — Admin (placeholder)</Text>
      </Center>
    </MantineProvider>
  );
}
