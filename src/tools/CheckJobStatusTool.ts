import { z } from "zod";

export interface CheckJobStatusInput {
  jobExecutionId: string;
  apiKey?: string;
}

export const checkJobStatusTool = {
  name: "check_job_status",
  description: "Check the status of a Copado job execution",
  
  async execute({ jobExecutionId, apiKey }: CheckJobStatusInput) {
    try {
      // Use provided API key or fall back to environment variable
      const authToken = apiKey || process.env.COPADO_API_KEY;
      
      if (!authToken) {
        throw new Error("API key is required. Provide it as a parameter or set COPADO_API_KEY environment variable.");
      }

      // Use Copado's job status endpoint (example - adjust based on actual API)
      const statusUrl = `https://app-api.copado.com/json/v1/webhook/mcwebhook/checkStatusAction`;
      
      const payload = {
        action: "CheckStatusAction",
        key: authToken,
        payload: {
          jobexecutionid: jobExecutionId
        }
      };

      console.log('🔍 Checking job status:');
      console.log('Job Execution ID:', jobExecutionId);

      const response = await fetch(statusUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'copado-webhook-key': authToken,
          'User-Agent': 'Copado-MCP-Server/1.0.0'
        },
        body: JSON.stringify(payload)
      });

      console.log('📥 Status check response:', response.status, response.statusText);
      
      const responseText = await response.text();
      console.log('📥 Status response body:', responseText);

      if (!response.ok) {
        throw new Error(`Copado status check failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        result = { message: responseText };
      }

      // Extract status information (adjust based on actual response format)
      const jobExecution = result.jobExecution || result;
      const status = jobExecution['copado__Status__c'] || jobExecution.status || 'Unknown';
      const startTime = jobExecution['CreatedDate'] || jobExecution.startTime;
      const endTime = jobExecution['LastModifiedDate'] || jobExecution.endTime;
      const errorMessage = jobExecution['copado__ErrorMessage__c'] || jobExecution.errorMessage;

      // Determine status emoji and next steps
      let statusEmoji = '⏳';
      let statusColor = 'YELLOW';
      let nextSteps = '';

      switch (status.toLowerCase()) {
        case 'completed':
        case 'success':
          statusEmoji = '✅';
          statusColor = 'GREEN';
          nextSteps = '🎉 Deployment completed successfully! Check your destination org.';
          break;
        case 'failed':
        case 'error':
          statusEmoji = '❌';
          statusColor = 'RED';
          nextSteps = '🔍 Check the error details and retry if needed.';
          break;
        case 'in progress':
        case 'running':
          statusEmoji = '🔄';
          statusColor = 'BLUE';
          nextSteps = '⏰ Deployment is still running. Check again in a few minutes.';
          break;
        case 'not started':
        case 'queued':
          statusEmoji = '⏳';
          statusColor = 'YELLOW';
          nextSteps = '📋 Job is queued and will start shortly.';
          break;
        default:
          statusEmoji = '❔';
          statusColor = 'GRAY';
          nextSteps = '🔍 Unknown status. Check Copado org for details.';
      }

      return {
        content: [{
          type: "text" as const,
          text: `${statusEmoji} **JOB STATUS UPDATE**

🆔 **Job Execution ID:** ${jobExecutionId}
📊 **Current Status:** ${status.toUpperCase()} (${statusColor})
⏰ **Started:** ${startTime ? new Date(startTime).toLocaleString() : 'N/A'}
${endTime ? `🏁 **Completed:** ${new Date(endTime).toLocaleString()}\n` : ''}${errorMessage ? `\n❌ **Error Details:**\n${errorMessage}\n` : ''}
🎯 **Next Steps:**
${nextSteps}

📋 **Status Guide:**
• ⏳ Not Started/Queued → 🔄 In Progress → ✅ Completed
• ❌ Failed (check error details)

🔄 **To check again:** Use "check status of job ${jobExecutionId}"`
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to check job status!

Error: ${errorMessage}

🔍 **Troubleshooting:**
• Verify the Job Execution ID is correct: ${jobExecutionId}
• Check your webhook key permissions
• Ensure the job exists in your Copado org
• Try again in a few moments`
        }],
        isError: true
      };
    }
  }
};

// Schema definition for the tool
export const checkJobStatusSchema = {
  jobExecutionId: z.string().describe("The Job Execution ID to check status for"),
  apiKey: z.string().optional().describe("Copado webhook key for authentication (optional if COPADO_API_KEY env var is set)")
};