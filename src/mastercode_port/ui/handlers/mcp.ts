// @ts-nocheck

export async function handleMcpMessage(panel: any, message: any): Promise<boolean> {
  switch (message.type) {
    case 'getMcpServers':
      await panel._sendMcpServers();
      return true;

    case 'mcpAction':
      await panel._handleMcpAction(message.action, message.serverId || message.name);
      return true;

    case 'addMcpServer':
      await panel._addMcpServer();
      return true;

    case 'removeMcpServer':
      await panel._handleMcpAction('remove', message.name);
      return true;

    case 'getMcpServerDetails':
      if (typeof message.name === 'string') {
        await panel._pingMcpServer(message.name);
      }
      return true;

    default:
      return false;
  }
}
