import { Agent } from "@cloudflare/agents";

export class MyAgent extends Agent {
  async onStart() {
    console.log("MyAgent started:", this.name);
  }

  async onMessage(connection: any, message: any) {
    const text = typeof message === "string" ? message : JSON.stringify(message);
    connection.send(JSON.stringify({
      type: "response",
      content: "FlyTripVisa MyAgent: " + text,
      timestamp: Date.now(),
    }));
  }

  async onConnect(connection: any) {
    connection.send(JSON.stringify({
      type: "welcome",
      message: "Connected to FlyTripVisa MyAgent",
      agentId: this.name,
      timestamp: Date.now(),
    }));
  }

  async onDisconnect(connection: any) {
    console.log("MyAgent disconnected:", connection.id);
  }

  async onError(connection: any, error: unknown) {
    console.error("MyAgent error:", error);
  }
}

