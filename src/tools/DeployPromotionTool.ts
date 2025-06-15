import { z } from "zod";

export interface DeployPromotionInput {
  promotionId: string;
  apiKey?: string;
}

export const deployPromotionTool = {
  name: "deploy_promotion",
  description: "Deploy a promotion using Copado's PromotionDeployment webhook",
  
  async execute({ promotionId, apiKey }: DeployPromotionInput) {
    try {
      // Use provided API key or fall back to environment variable
      const authToken = process.env.COPADO_API_KEY;
      
      if (!authToken) {
        throw new Error("API key is required. Provide it as a parameter or set COPADO_API_KEY environment variable.");
      }

      // Use the current Copado API endpoint
      const webhookUrl = `https://app-api.copado.com/json/v1/webhook/mcwebhook/promotiondeployment`;
      
      // Use the correct payload format from documentation
      const payload = {
        action: "PromotionDeployment",
        key: authToken,
        payload: {
          promotionId: promotionId
        }
      };

      console.log('🔍 Making request to Copado API:');
      console.log('URL:', webhookUrl);
      console.log('Headers:', {
        'Content-Type': 'application/json',
        'copado-webhook-key': `${authToken.substring(0, 10)}...`,
        'User-Agent': 'Copado-MCP-Server/1.0.0'
      });
      console.log('Payload:', JSON.stringify({
        action: payload.action,
        key: `${authToken.substring(0, 10)}...`,
        payload: payload.payload
      }, null, 2));

      // Make the POST request with both header and key in payload
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'copado-webhook-key': authToken,
          'User-Agent': 'Copado-MCP-Server/1.0.0'
        },
        body: JSON.stringify(payload)
      });

      console.log('📥 Response status:', response.status, response.statusText);
      
      const responseText = await response.text();
      console.log('📥 Response body:', responseText);

      if (!response.ok) {
        throw new Error(`Copado API request failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        result = { message: responseText, status: 'completed' };
      }

      // Extract key information from Copado's response
      const jobExecution = result.jobExecution || {};
      const jobExecutionId = jobExecution.Id;
      const deploymentId = jobExecution['copado__Deployment__c'];
      const status = jobExecution['copado__Status__c'];
      const template = jobExecution['copado__Template__c'];
      
      // Parse additional details from DataJson if available
      let additionalInfo = '';
      try {
        const dataJson = JSON.parse(jobExecution['copado__DataJson__c'] || '{}');
        const userStoryIds = dataJson.userStoryIds || [];
        const userStoryBranches = dataJson.userStoryBranches || [];
        
        if (userStoryIds.length > 0) {
          additionalInfo += `\n📝 User Stories: ${userStoryIds.join(', ')}`;
        }
        if (userStoryBranches.length > 0) {
          additionalInfo += `\n🌿 Branches: ${userStoryBranches.join(', ')}`;
        }
      } catch (parseError) {
        // Ignore parsing errors for additional info
      }

      // Structure response for easy AI parsing
      return {
        content: [{
          type: "text" as const,
          text: `✅ Promotion deployment initiated successfully!

🎯 **DEPLOYMENT SUMMARY**
• Promotion ID: ${promotionId}
• Job Execution ID: ${jobExecutionId}
• Deployment ID: ${deploymentId}
• Current Status: ${status}
• Template: ${template}${additionalInfo}

🔧 **FOR STATUS CHECKS:**
Use Job Execution ID: **${jobExecutionId}**

📋 **NEXT STEPS:**
• Monitor deployment progress in your Copado org
• Use "check status of job ${jobExecutionId}" to get updates
• The deployment will process through: Not Started → In Progress → Completed/Failed

⏰ Deployment initiated at: ${new Date().toISOString()}`
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to deploy promotion!\n\n` +
                `Error: ${errorMessage}\n\n` +
                `Please check:\n` +
                `- Your webhook key is valid and has proper permissions\n` +
                `- The promotion ID (${promotionId}) exists and is ready for deployment\n` +
                `- Your network connection is stable`
        }],
        isError: true
      };
    }
  }
};

// Schema definition for the tool
export const deployPromotionSchema = {
  promotionId: z.string().describe("The ID of the promotion to deploy"),
  apiKey: z.string().optional().describe("Copado webhook key for authentication (optional if COPADO_API_KEY env var is set)")
};