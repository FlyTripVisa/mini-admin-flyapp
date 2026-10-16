import { MyAgent } from './index';
import { ChatAgent } from './chat-agent';

// Export Durable Object classes
export { MyAgent, ChatAgent };

export interface Env {
	// AI
	AI: Ai;
	AI_SEARCH: AiSearch;
	// Durable Objects
	MyAgent: DurableObjectNamespace;
	ChatAgent: DurableObjectNamespace;
	// D1
	DB: D1Database;
	DB2: D1Database;
	// KV
	KV_BINDING: KVNamespace;
	// Browser
	BROWSER: Fetcher;
	// R2
	BUCKET: R2Bucket;
	AI_CHAT_BUCKET: R2Bucket;
	// Assets
	ASSETS: Fetcher;
}

// ==================== AUTH CONFIG ====================
const ADMIN_USERNAME = 'flytripvisa';
const ADMIN_PASSWORD = 'pass1122';

// ==================== TYPES ====================
interface Client {
	id?: number;
	name: string;
	email: string;
	phone: string;
	country: string;
	visa_type: string;
	status: 'pending' | 'processing' | 'approved' | 'rejected';
	amount: number;
	created_at?: string;
}

interface Invoice {
	id?: number;
	client_id: number;
	invoice_number: string;
	amount: number;
	status: 'draft' | 'sent' | 'paid' | 'overdue';
	pdf_url?: string;
	created_at?: string;
}

// ==================== HELPER FUNCTIONS ====================
function generateToken(): string {
	return btoa(Date.now().toString() + Math.random().toString()).slice(0, 32);
}

function basicAuthHeader(): string {
	return 'Basic ' + btoa(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`);
}

async function authenticate(request: Request): Promise<boolean> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) return false;

	const expected = basicAuthHeader();
	return authHeader === expected;
}

// Generate a simple PDF invoice as HTML->PDF using the browser binding
async function generatePDFInvoice(env: Env, client: Client, invoice: Invoice): Promise<Uint8Array | null> {
	try {
		const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${invoice.invoice_number}</title>
<style>
body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #333; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #07c160; padding-bottom: 20px; }
.logo { font-size: 24px; font-weight: bold; color: #07c160; }
.invoice-title { font-size: 28px; color: #333; }
.info-section { margin: 30px 0; }
.row { display: flex; justify-content: space-between; margin-bottom: 10px; }
.label { color: #666; }
.value { font-weight: bold; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; }
th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
th { background: #07c160; color: #fff; }
.total-row { font-size: 18px; font-weight: bold; color: #07c160; }
.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #888; font-size: 12px; }
.status-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; background: #07c160; color: #fff; font-size: 12px; }
</style>
</head>
<body>
<div class="header">
<div class="logo">✈️ Fly Trip Visa</div>
<div class="invoice-title">INVOICE</div>
</div>
<div class="info-section">
<div class="row"><span class="label">Invoice #:</span><span class="value">${invoice.invoice_number}</span></div>
<div class="row"><span class="label">Date:</span><span class="value">${new Date().toLocaleDateString()}</span></div>
<div class="row"><span class="label">Status:</span><span class="value"><span class="status-badge">${invoice.status.toUpperCase()}</span></span></div>
</div>
<div class="info-section">
<h3>Bill To:</h3>
<div class="row"><span class="label">Name:</span><span class="value">${client.name}</span></div>
<div class="row"><span class="label">Email:</span><span class="value">${client.email}</span></div>
<div class="row"><span class="label">Phone:</span><span class="value">${client.phone}</span></div>
</div>
<table>
<thead>
<tr><th>Description</th><th>Type</th><th>Amount</th></tr>
</thead>
<tbody>
<tr><td>Visa Processing - ${client.country}</td><td>${client.visa_type}</td><td>$${invoice.amount}</td></tr>
</tbody>
</table>
<div class="row total-row"><span>Total:</span><span>$${invoice.amount}</span></div>
<div class="footer">
Fly Trip Visa | 飞行旅行签证 — Your trusted digital travel partner<br>
Contact: visa@flytripvisa.site | +8801338354383
</div>
</body>
</html>`;

		// Use Browser binding to generate PDF
		const response = await env.BROWSER.fetch('https://browser-rendering.cloudflare.com/v1/pdf', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				html,
				options: {
					format: 'A4',
					printBackground: true,
				},
			}),
		});

		if (response.ok) {
			return new Uint8Array(await response.arrayBuffer());
		}
		return null;
	} catch (e) {
		console.error('PDF generation error:', e);
		return null;
	}
}

// Send email via a simple notification (stored in KV + logged)
async function sendEmailNotification(env: Env, to: string, subject: string, body: string): Promise<void> {
	// Store email in KV for tracking
	const emailLog = {
		to,
		subject,
		body,
		timestamp: Date.now(),
		status: 'queued',
	};
	await env.KV_BINDING.put(
		`email:${Date.now()}:${to}`,
		JSON.stringify(emailLog),
		{ expirationTtl: 86400 * 7 }
	);
	console.log(`📧 Email queued: ${subject} -> ${to}`);
}

// ==================== MAIN WORKER ====================
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// Serve static assets for non-API, non-admin routes
		if (!pathname.startsWith('/api/') && !pathname.startsWith('/admin')) {
			return env.ASSETS.fetch(request);
		}

		// ==================== ADMIN LOGIN ====================
		if (pathname === '/admin/login' && request.method === 'POST') {
			const body = await request.json() as { username?: string; password?: string };
			if (body.username === ADMIN_USERNAME && body.password === ADMIN_PASSWORD) {
				const token = generateToken();
				await env.KV_BINDING.put(`session:${token}`, ADMIN_USERNAME, { expirationTtl: 86400 });
				return new Response(
					JSON.stringify({ success: true, token, message: 'Login successful' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(
				JSON.stringify({ success: false, message: 'Invalid credentials' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// ==================== ADMIN PAGE ====================
		if (pathname === '/admin' || pathname === '/admin/') {
			return env.ASSETS.fetch(new Request('https://example.com/admin/index.html'));
		}

		// ==================== AUTHENTICATED ADMIN API ====================
		const isAuthenticated = await authenticate(request);

		// Auth check for all admin API routes
		if (pathname.startsWith('/api/admin/') && !isAuthenticated) {
			return new Response(
				JSON.stringify({ error: 'Unauthorized' }),
				{ status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic' } }
			);
		}

		// ==================== DASHBOARD STATS ====================
		if (pathname === '/api/admin/stats' && request.method === 'GET') {
			try {
				const [totalClients, pendingClients, approvedClients, totalRevenue] = await Promise.all([
					env.DB.prepare('SELECT COUNT(*) as count FROM clients').first<{ count: number }>(),
					env.DB.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'pending'").first<{ count: number }>(),
					env.DB.prepare("SELECT COUNT(*) as count FROM clients WHERE status = 'approved'").first<{ count: number }>(),
					env.DB.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM invoices WHERE status = ?').bind('paid').first<{ total: number }>(),
				]);

				return new Response(
					JSON.stringify({
						totalClients: totalClients?.count || 0,
						pendingClients: pendingClients?.count || 0,
						approvedClients: approvedClients?.count || 0,
						totalRevenue: totalRevenue?.total || 0,
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			} catch (e) {
				return new Response(
					JSON.stringify({ error: 'Database error', details: String(e) }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		// ==================== CLIENTS CRUD ====================
		// List all clients
		if (pathname === '/api/admin/clients' && request.method === 'GET') {
			const { results } = await env.DB.prepare('SELECT * FROM clients ORDER BY created_at DESC').all<Client>();
			return new Response(JSON.stringify(results || []), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Create client
		if (pathname === '/api/admin/clients' && request.method === 'POST') {
			const client = await request.json<Client>();
			const result = await env.DB.prepare(
				'INSERT INTO clients (name, email, phone, country, visa_type, status, amount) VALUES (?, ?, ?, ?, ?, ?, ?)'
			).bind(client.name, client.email, client.phone, client.country, client.visa_type, client.status || 'pending', client.amount || 0).run();

			// Send welcome email
			await sendEmailNotification(
				env,
				client.email,
				'Welcome to Fly Trip Visa!',
				`Dear ${client.name}, your visa application for ${client.country} (${client.visa_type}) has been registered. We will process it shortly.`
			);

			return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Update client
		if (pathname.match(/^\/api\/admin\/clients\/\d+$/) && request.method === 'PUT') {
			const id = pathname.split('/').pop();
			const client = await request.json<Client>();
			await env.DB.prepare(
				'UPDATE clients SET name = ?, email = ?, phone = ?, country = ?, visa_type = ?, status = ?, amount = ? WHERE id = ?'
			).bind(client.name, client.email, client.phone, client.country, client.visa_type, client.status, client.amount, id).run();

			// Notify client of status change
			if (client.status === 'approved' || client.status === 'rejected') {
				await sendEmailNotification(
					env,
					client.email,
					`Visa Application ${client.status.charAt(0).toUpperCase() + client.status.slice(1)}`,
					`Dear ${client.name}, your visa application for ${client.country} has been ${client.status}. Please contact us for next steps.`
				);
			}

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Delete client
		if (pathname.match(/^\/api\/admin\/clients\/\d+$/) && request.method === 'DELETE') {
			const id = pathname.split('/').pop();
			await env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run();
			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// ==================== INVOICES ====================
		// List invoices
		if (pathname === '/api/admin/invoices' && request.method === 'GET') {
			const { results } = await env.DB.prepare(`
				SELECT i.*, c.name as client_name, c.email as client_email 
				FROM invoices i 
				LEFT JOIN clients c ON i.client_id = c.id 
				ORDER BY i.created_at DESC
			`).all();
			return new Response(JSON.stringify(results || []), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Create invoice + generate PDF + send email
		if (pathname === '/api/admin/invoices' && request.method === 'POST') {
			const invoice = await request.json<Invoice>();
			const invNumber = `FTV-${Date.now().toString().slice(-6)}`;

			const result = await env.DB.prepare(
				'INSERT INTO invoices (client_id, invoice_number, amount, status) VALUES (?, ?, ?, ?)'
			).bind(invoice.client_id, invNumber, invoice.amount, invoice.status || 'draft').run();

			// Get client info
			const client = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(invoice.client_id).first<Client>();

			if (client) {
				// Generate PDF
				const pdf = await generatePDFInvoice(env, client, { ...invoice, invoice_number: invNumber });
				if (pdf) {
					const pdfKey = `invoices/${invNumber}.pdf`;
					await env.BUCKET.put(pdfKey, pdf, { contentType: 'application/pdf' });
					await env.DB.prepare("UPDATE invoices SET pdf_url = ? WHERE id = ?").bind(pdfKey, result.meta.last_row_id).run();

					// Send email with invoice
					await sendEmailNotification(
						env,
						client.email,
						`Invoice ${invNumber} - Fly Trip Visa`,
						`Dear ${client.name}, your invoice ${invNumber} for $${invoice.amount} has been generated. Please find the attached PDF. Thank you for choosing Fly Trip Visa!`
					);
				}
			}

			return new Response(JSON.stringify({ success: true, id: result.meta.last_row_id, invoice_number: invNumber }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// Download invoice PDF
		if (pathname.match(/^\/api\/admin\/invoices\/\d+\/pdf$/) && request.method === 'GET') {
			const id = pathname.split('/')[4];
			const invoice = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first<Invoice>();
			if (!invoice || !invoice.pdf_url) {
				return new Response('Invoice PDF not found', { status: 404 });
			}
			const pdf = await env.BUCKET.get(invoice.pdf_url);
			if (!pdf) {
				return new Response('PDF not found in storage', { status: 404 });
			}
			return new Response(pdf.body, {
				status: 200,
				headers: {
					'Content-Type': 'application/pdf',
					'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"`,
				},
			});
		}

		// ==================== EMAIL LOGS ====================
		if (pathname === '/api/admin/emails' && request.method === 'GET') {
			const emails: string[] = [];
			// List recent email logs from KV
			const list = await env.KV_BINDING.list({ prefix: 'email:', limit: 50 });
			for (const key of list.keys) {
				const data = await env.KV_BINDING.get(key.name);
				if (data) emails.push(JSON.parse(data));
			}
			return new Response(JSON.stringify(emails), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// ==================== AI CHAT ENDPOINT (for frontend) ====================
		if (pathname === '/api/ai-chat' && request.method === 'POST') {
			const body = await request.json<{ message: string; context?: any }>();
			try {
				const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
					prompt: `You are Fly Dragon AI Assistant for Fly Trip Visa. Help the user with visa, flight, and hotel bookings. User says: ${body.message}`,
					max_tokens: 200,
				});
				return new Response(
					JSON.stringify({ reply: response.response || 'How can I help you?' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			} catch (e) {
				return new Response(
					JSON.stringify({ reply: 'AI service is currently unavailable. Please try again later.' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
		}

		// ==================== AGENT ROUTES ====================
		if (pathname.startsWith('/api/my-agent')) {
			const agentId = url.searchParams.get('id') || 'default';
			const id = env.MyAgent.idFromName(agentId);
			const agent = env.MyAgent.get(id);
			return agent.fetch(request);
		}

		if (pathname.startsWith('/api/chat')) {
			const agentId = url.searchParams.get('id') || 'default';
			const id = env.ChatAgent.idFromName(agentId);
			const agent = env.ChatAgent.get(id);
			return agent.fetch(request);
		}

		// Health check
		if (pathname === '/api/health') {
			return new Response(
				JSON.stringify({ status: 'ok', service: 'FlyTripVisa Admin', timestamp: Date.now() }),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
