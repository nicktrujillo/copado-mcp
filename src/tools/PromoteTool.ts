import { z } from "zod";

export interface PromoteInput {
  userStoryIds: string;
  executeDeployment?: boolean;
  deploymentDryRun?: boolean;
  apiKey?: string;
}

// Helper function to parse user story IDs from various formats
function parseUserStoryIds(userStoryIds: string): string[] {
  // Handle different formats:
  // "a0u1v00001fGK5PAAW"
  // "a0u1v00001fGK5PAAW, a0u1v00001fGK5PBAW"
  // "a0u1v00001fGK5PAAW and a0u1v00001fGK5PBAW"
  // ["a0u1v00001fGK5PAAW", "a0u1v00001fGK5PBAW"]
  
  let cleanedIds = userStoryIds
    .replace(/[\[\]"']/g, '') // Remove brackets and quotes
    .replace(/\s+and\s+/gi, ',') // Replace "and" with comma
    .split(',') // Split by comma
    .map(id => id.trim()) // Trim whitespace
    .filter(id => id.length > 0); // Remove empty strings
  
  return cleanedIds;
}

export const promoteTool = {
  name: "promote_user_story",
  description: "Create a promotion for user stories in Copado. Optionally execute deployment automatically.",
  
  async execute({ userStoryIds, executeDeployment = false, deploymentDryRun = false, apiKey }: PromoteInput) {
    try {
      // Use provided API key or fall back to environment variable
      const authToken = apiKey
      
      if (!authToken) {
        throw new Error("API key is required. Provide it as a parameter or set COPADO_API_KEY environment variable.");
      }

      // Parse user story IDs into array format
      const parsedUserStoryIds = parseUserStoryIds(userStoryIds);
      
      if (parsedUserStoryIds.length === 0) {
        throw new Error("No valid user story IDs provided. Please provide at least one user story ID.");
      }

      // Use the Copado promotion webhook endpoint
      const webhookUrl = `https://app-api.copado.com/json/v1/webhook/mcwebhook/promotion`;
      
      // Use the correct payload format
      const payload = {
        action: "Promotion",
        key: authToken,
        payload: {
          userStoryIds: parsedUserStoryIds,
          executeDeployment: executeDeployment,
          deploymentDryRun: deploymentDryRun,
          sourceEnvironmentId: "a0c8c00000LpAxEAAV"
        }
      };

      console.log('🔍 Making promotion request to Copado API:');
      console.log('URL:', webhookUrl);
      console.log('Headers:', {
        'Content-Type': 'application/json',
        'copado-webhook-key': `${authToken.substring(0, 10)}...`,
        'User-Agent': 'Copado-MCP-Server/1.0.0'
      });
      console.log('Payload:', JSON.stringify({
        action: payload.action,
        key: `${authToken.substring(0, 10)}...`,
        payload: {
          userStoryIds: parsedUserStoryIds,
          executeDeployment: executeDeployment,
          deploymentDryRun: deploymentDryRun,
          sourceEnvironmentId: "a0c8c00000LpAxEAAV"
        }
      }, null, 2));

      // Make the POST request
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'copado-webhook-key': authToken,
          'User-Agent': 'Copado-MCP-Server/1.0.0'
        },
        body: JSON.stringify(payload)
      });

      console.log('📥 Promotion response status:', response.status, response.statusText);
      
      const responseText = await response.text();
      console.log('📥 Promotion response body:', responseText);

      if (!response.ok) {
        throw new Error(`Copado promotion request failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        result = { message: responseText, status: 'completed' };
      }

      // Extract promotion information from response
      const jobExecution = result.jobExecution || {};
      const promotionJobExecutionId = jobExecution.Id;
      const promotionId = result.promotionId || jobExecution['copado__Promotion__c'];
      const status = jobExecution['copado__Status__c'] || 'Submitted';
      
      // Extract deployment information if executeDeployment was true
      const deploymentJobExecution = result.deploymentJobExecution || {};
      const deploymentJobExecutionId = deploymentJobExecution.Id;
      const deploymentId = deploymentJobExecution['copado__Deployment__c'];

      // Format user stories for display
      const userStoriesDisplay = parsedUserStoryIds.map(id => `• ${id}`).join('\n');

      // Determine deployment status and next steps
      let deploymentInfo = '';
      let nextSteps = '';
      
      if (executeDeployment) {
        const deploymentType = deploymentDryRun ? 'VALIDATION' : 'DEPLOYMENT';
        deploymentInfo = `
🚀 **DEPLOYMENT EXECUTED:**
• Deployment Job ID: ${deploymentJobExecutionId}
• Deployment ID: ${deploymentId}
• Type: ${deploymentType}
• Auto-executed: Yes`;

        nextSteps = `🎯 **NEXT STEPS:**
• Monitor deployment progress: "check status of job ${deploymentJobExecutionId}"
• ${deploymentDryRun ? 'Validation completed - review results before actual deployment' : 'Deployment in progress - check destination org when complete'}`;
      } else {
        nextSteps = `🎯 **NEXT STEPS:**
• Promotion created successfully
• Use "deploy promotion ${promotionId}" to deploy the promotion
• Or use "deploy promotion ${promotionId} as validation" for validation-only`;
      }

      return {
        content: [{
          type: "text" as const,
          text: `✅ User Story promotion ${executeDeployment ? 'and deployment ' : ''}initiated successfully!

🎯 **PROMOTION SUMMARY**
• Promotion ID: ${promotionId}
• Promotion Job ID: ${promotionJobExecutionId}
• Status: ${status}
• Execute Deployment: ${executeDeployment}
• Deployment Dry Run: ${deploymentDryRun}${deploymentInfo}

📝 **INCLUDED USER STORIES:**
${userStoriesDisplay}

🔧 **FOR DEPLOYMENT:**
${executeDeployment ? `Use Job Execution ID: **${deploymentJobExecutionId}**` : `Use Promotion ID: **${promotionId}**`}

${nextSteps}

⏰ Promotion initiated at: ${new Date().toISOString()}`
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to create promotion!

Error: ${errorMessage}

🔍 **Troubleshooting:**
• Verify User Story IDs are correct: ${userStoryIds}
• Check that User Stories exist and are ready for promotion
• Ensure your webhook key has promotion permissions
• Verify User Stories are not already in an active promotion

📝 **User Stories attempted:**
${userStoryIds}

💡 **Tip:** Ensure User Stories have committed changes and are in a promotable state`
        }],
        isError: true
      };
    }
  }
};

// Schema definition for the tool
export const promoteSchema = {
  userStoryIds: z.string().describe("User Story IDs to include in the promotion (comma-separated or single ID)"),
  executeDeployment: z.boolean().optional().default(false).describe("Whether to automatically execute deployment after promotion (default: false)"),
  deploymentDryRun: z.boolean().optional().default(false).describe("Whether to run as validation-only deployment when executeDeployment is true (default: false)"),
  apiKey: z.string().optional().describe("Copado webhook key for authentication (optional if COPADO_API_KEY env var is set)")
};