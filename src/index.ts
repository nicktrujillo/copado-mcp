import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from 'zod';
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { commitTool, commitSchema } from "./tools/CommitTool.js";
import { promoteTool, promoteSchema } from "./tools/PromoteTool.js";
import { deployPromotionTool, deployPromotionSchema } from "./tools/DeployPromotionTool.js";
import { checkJobStatusTool, checkJobStatusSchema } from "./tools/CheckJobStatusTool.js";

interface Env {
    COPADO_API_KEY: string;
}

// Optional: Define configuration schema to require configuration at connection time
export const configSchema = z.object({
    debug: z.boolean().default(false).describe("Enable debug logging")
});

// Create the Copado MCP Server
export class MyMCP extends McpAgent {
    server = new McpServer({
        name: "copado-mcp",
        version: "1.0.0",
    });

    async init() {
        // Register tools using the correct MCP SDK format
        this.server.tool(
                commitTool.name,
                commitSchema,
                commitTool.execute
        );

        this.server.tool(
                promoteTool.name,
                promoteSchema,
                promoteTool.execute
        );

        this.server.tool(
                deployPromotionTool.name,
                deployPromotionSchema,
                deployPromotionTool.execute
        );

        this.server.tool(
                checkJobStatusTool.name,
                checkJobStatusSchema,
                checkJobStatusTool.execute
        );

        // Add documentation resource
        this.server.resource(
        "copado-webhooks-docs",
        "copado://webhooks/documentation",
                async (uri) => ({
                    contents: [{
                        uri: uri.href,
                        mimeType: "text/markdown",
                        text: `# Copado MCP Server Documentation

                        ## Complete Copado Workflow Tools

                        ### 1. Commit Changes Tool
                        Commits changes to a Copado User Story with intelligent parsing of change descriptions.

                        **Usage:**
                        \`\`\`
                        I modified the AccountController apex class. Commit those changes to User Story a1u7Q000000LkSVQA0
                        \`\`\`

                        **Parameters:**
                        - **userStoryId**: The Salesforce ID of the User Story
                        - **changesDescription**: Natural language description of changes made
                        - **commitMessage**: Optional commit message (auto-generated if not provided)
                        - **apiKey**: Your Copado webhook key (optional if COPADO_API_KEY env var is set)

                        ### 2. Promote User Story Tool
                        Creates a promotion for user stories. Optionally executes deployment automatically.

                        **Usage:**
                        \`\`\`
                        Promote user story a1u7Q000000LkSVQA0
                        Promote and deploy user story a1u7Q000000LkSVQA0
                        Promote and validate user story a1u7Q000000LkSVQA0
                        \`\`\`

                        **Parameters:**
                        - **userStoryIds**: User Story IDs to include (comma-separated or single ID)
                        - **executeDeployment**: Auto-deploy after promotion (default: false)
                        - **deploymentDryRun**: Run validation-only deployment (default: false)
                        - **apiKey**: Your Copado webhook key (optional if COPADO_API_KEY env var is set)

                        ### 3. Deploy Promotion Tool
                        Triggers a deployment of an existing promotion.

                        **Usage:**
                        \`\`\`
                        Deploy promotion a0q5p00001GTeo9AAD
                        \`\`\`

                        **Parameters:**
                        - **promotionId**: The Salesforce ID of the promotion record
                        - **apiKey**: Your Copado webhook key (optional if COPADO_API_KEY env var is set)

                        ### 4. Check Job Status Tool
                        Checks the status of a Copado job execution.

                        **Usage:**
                        \`\`\`
                        Check status of job a0sKa00000WBZN9IAP
                        \`\`\`

                        **Parameters:**
                        - **jobExecutionId**: The Job Execution ID to check status for
                        - **apiKey**: Your Copado webhook key (optional if COPADO_API_KEY env var is set)

                        ## Complete Workflow Examples

                        ### Full Development Cycle:
                        \`\`\`
                        I modified the AccountController class. Commit to user story a1u123, promote it, deploy to production, and check status
                        \`\`\`

                        **AI Execution:**
                        1. commit_changes → Commits changes to user story
                        2. promote_user_story → Creates promotion 
                        3. promote_user_story → Auto-deploys (executeDeployment: true)
                        4. check_job_status → Monitors deployment progress

                        ### Validation Workflow:
                        \`\`\`
                        Commit my apex changes to user story a1u123 and promote for validation
                        \`\`\`

                        **AI Execution:**
                        1. commit_changes → Commits changes
                        2. promote_user_story → Creates promotion and runs validation (deploymentDryRun: true)
                        3. check_job_status → Monitors validation

                        ### Staged Deployment:
                        \`\`\`
                        Commit changes to user story a1u123 and create promotion for later
                        \`\`\`
                        *Later...*
                        \`\`\`
                        Deploy the promotion
                        \`\`\`

                        **AI Execution:**
                        1. commit_changes → Commits changes
                        2. promote_user_story → Creates promotion only (executeDeployment: false)
                        3. deploy_promotion → Deploys when ready

                        ## AI Intelligence Features

                        - **Smart Change Parsing**: Converts natural language to Copado metadata format
                        - **Intent Detection**: Automatically sets deployment flags based on user intent
                        - **Tool Chaining**: Seamlessly chains operations in logical workflow order
                        - **Context Awareness**: Uses previous responses to chain subsequent tools
                        - **Flexible Input**: Handles various formats for user story IDs and descriptions

                        ## Supported Metadata Types

                        - ApexClass, ApexTrigger, LightningComponentBundle (LWC)
                        - Flow, CustomObject, CustomField, Layout
                        - PermissionSet, Profile, CustomLabel, ValidationRule
                        - EmailTemplate, Report, Dashboard, and more...

                        ## API Endpoints
                        - Commit: \`https://app-api.copado.com/json/v1/webhook/mcwebhook/commit\`
                        - Promote: \`https://app-api.copado.com/json/v1/webhook/mcwebhook/promotion\`
                        - Deploy: \`https://app-api.copado.com/json/v1/webhook/mcwebhook/promotiondeployment\`

                        ## Notes
                        - All tools support AI context reliance for seamless chaining
                        - Webhook key must have appropriate permissions for each operation
                        - Tools automatically detect user intent for deployment vs. validation
                        - Monitor progress through Copado org or status check tools
                        `
                    }]
                })
        );
    }
}

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        
        // Set global access to the API key for tools
        (globalThis as any).COPADO_API_KEY = env.COPADO_API_KEY;

        if (url.pathname === "/sse" || url.pathname === "/sse/message") {
            return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
        }

        if (url.pathname === "/mcp") {
            return MyMCP.serve("/mcp").fetch(request, env, ctx);
        }

        return new Response("Not found", { status: 404 });
        
    },
};



