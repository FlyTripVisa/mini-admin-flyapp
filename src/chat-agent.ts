import { Agent, Connection, ConnectionContext, Message } from '@cloudflare/agents';

/**
 * ChatAgent - A chat-focused Agent with persistent conversation history.
 * Uses built-in SQLite storage via Durable Objects.
 */
export class ChatAgent extends Agent<Env> {
	private messages: Array<{ role: string; content: string; timestamp: number }> = [];

	async onStart(): Promise<void> {
		console.log(`ChatAgent started: ${this.name}`);
		try {
			const stored = await this.sql<{ role: string; content: string; timestamp: number }>`
				SELECT role, content, timestamp FROM messages ORDER BY timestamp ASC
			`.all();
			if (stored.results) {
				this.messages = stored.results;
			}
		} catch {
			// Table might not exist yet — first run
			console.log('ChatAgent: messages table not found, will create on first message');
		}
	}

	async onMessage(connection: Connection, message: Message): Promise<void> {
		const text = typeof message === 'string' ? message : JSON.stringify(message);

		// Store user message
		await this.sql`
			INSERT INTO messages (role, content, timestamp) VALUES (${'user'}, ${text}, ${Date.now()})
		`.run();
		this.messages.push({ role: 'user', content: text, timestamp: Date.now() });

		// Generate response
		const response = this.generateResponse(text);

		// Store assistant response
		await this.sql`
			INSERT INTO messages (role, content, timestamp) VALUES (${'assistant'}, ${response}, ${Date.now()})
		`.run();
		this.messages.push({ role: 'assistant', content: response, timestamp: Date.now() });

		connection.send(
			JSON.stringify({
				type: 'chat',
				content: response,
				history: this.messages.slice(-10),
				timestamp: Date.now(),
			})
		);
	}

	async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
		connection.send(
			JSON.stringify({
				type: 'connected',
				message: 'Welcome to Fly Dragon 🐉 AI Assistant!',
				history: this.messages.slice(-10),
				timestamp: Date.now(),
			})
		);
	}

	async onDisconnect(connection: Connection): Promise<void> {
		console.log(`ChatAgent disconnected: ${connection.id}`);
	}

	async onError(connection: Connection, error: unknown): Promise<void> {
		console.error(`ChatAgent error:`, error);
	}

	private generateResponse(input: string): string {
		const lower = input.toLowerCase();

		if (lower.includes('hello') || lower.includes('hi')) {
			return 'Hello! I\'m Fly Dragon 🐉 AI Assistant. How can I help you with visa, flight, or hotel bookings today?';
		}
		if (lower.includes('visa')) {
			return 'We process visas for 40+ countries including UAE, Turkey, Malaysia, China, Schengen, USA, UK, and more. Which country are you interested in?';
		}
		if (lower.includes('flight') || lower.includes('ticket')) {
			return 'We offer competitive flight bookings worldwide. Please let me know your destination and travel dates!';
		}
		if (lower.includes('hotel')) {
			return 'We have hotel reservations in Dubai, China, Malaysia, Vietnam, and many more destinations. Where would you like to stay?';
		}
		if (lower.includes('contact')) {
			return '📞 WhatsApp: +8801338354383 | Telegram: @TripVisa | Email: visa@flytripvisa.site';
		}
		if (lower.includes('bye') || lower.includes('goodbye')) {
			return 'Thank you for choosing Fly Trip Visa! Have a great journey! ✈️';
		}

		return `I received your message: "${input}". I'm here to help with visa applications, flight bookings, hotel reservations, and travel planning. How can I assist you?`;
	}
}
