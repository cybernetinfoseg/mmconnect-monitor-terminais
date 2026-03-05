import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const apiKey = req.headers.get('x-agent-api-key') || req.headers.get('api_key');
        const appId = req.headers.get('x-app-id');

        if (!apiKey || !appId) {
            return Response.json({ valid: false, error: 'Missing api_key or app_id' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);

        // Find user with this api_key using service role
        const users = await base44.asServiceRole.entities.User.filter({ api_key: apiKey });

        if (!users || users.length === 0) {
            return Response.json({ valid: false, error: 'API Key inválida ou revogada' }, { status: 401 });
        }

        const user = users[0];

        return Response.json({
            valid: true,
            user_email: user.email,
            user_id: user.id
        });
    } catch (error) {
        return Response.json({ valid: false, error: error.message }, { status: 500 });
    }
});