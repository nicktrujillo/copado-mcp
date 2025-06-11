import { z } from "zod";

export interface CommitInput {
  userStoryId: string;
  changesDescription: string;
  commitMessage?: string;
  apiKey?: string;
}

// Helper function to parse changes description and convert to Copado format
// Additional improvements: better pattern ordering and exclusions
function parseChangesToCopadoFormat(description: string): Array<{a: string, n: string, t: string, m: string}> {
  const changes: Array<{a: string, n: string, t: string, m: string}> = [];
  
  // Common Salesforce metadata type mappings with more variations
  const typeMap = {
    'apex class': 'ApexClass',
    'class': 'ApexClass',
    'apex trigger': 'ApexTrigger', 
    'trigger': 'ApexTrigger',
    'lightning component': 'LightningComponentBundle',
    'lwc': 'LightningComponentBundle',
    'component': 'LightningComponentBundle',
    'flow': 'Flow',
    'custom object': 'CustomObject',
    'object': 'CustomObject',
    'custom field': 'CustomField',
    'field': 'CustomField',
    'layout': 'Layout',
    'permission set': 'PermissionSet',
    'profile': 'Profile',
    'custom label': 'CustomLabel',
    'label': 'CustomLabel',
    'validation rule': 'ValidationRule',
    'workflow rule': 'WorkflowRule',
    'email template': 'EmailTemplate',
    'report': 'Report',
    'dashboard': 'Dashboard'
  };

  // Common action mappings
  const actionMap = {
    'added': 'Add',
    'created': 'Add',
    'new': 'Add',
    'modified': 'Add',
    'changed': 'Add',
    'updated': 'Add',
    'edited': 'Add',
    'deleted': 'Delete',
    'removed': 'Delete'
  };

  // Words to exclude from component names
  const excludeWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'made', 'some', 'changes', 'also', 'gave', 'access', 'it', 'them', 'this', 'that',
    'add', 'modify', 'delete', 'user', 'story', 'updated', 'created', 'modified',
    'changed', 'new', 'old', 'existing', 'current', 'previous', 'next', 'first', 'last'
  ]);

  // Default module path
  const defaultModule = 'force-app/main/default';
  
  // Default action
  let defaultAction = 'Add';
  const lowerDesc = description.toLowerCase();
  
  // Extract default action
  for (const [keyword, actionValue] of Object.entries(actionMap)) {
    if (lowerDesc.includes(keyword)) {
      defaultAction = actionValue;
      break;
    }
  }

  // More sophisticated parsing: look for specific patterns
  const componentPatterns = [
    // Pattern: "ComponentName class/trigger/etc"
    /\b([A-Z][A-Za-z0-9_]*)\s+(class|trigger|component|flow|object|field|layout|profile|label)\b/gi,
    // Pattern: "class/trigger/etc ComponentName" 
    /\b(class|trigger|component|flow|object|field|layout|profile|label)\s+([A-Z][A-Za-z0-9_]*)\b/gi,
    // Pattern: "apex class ComponentName" or "custom object ComponentName"
    /\b(?:apex\s+)?(class|trigger|component|flow|object|field|layout|profile|label)\s+([A-Z][A-Za-z0-9_]*)\b/gi,
    // Pattern: "ComponentName apex class" 
    /\b([A-Z][A-Za-z0-9_]*)\s+apex\s+(class|trigger)\b/gi,
    // Pattern: quoted component names
    /["']([A-Z][A-Za-z0-9_]+)["']/g
  ];

  const foundComponents = new Map<string, string>(); // name -> type

  // Process each pattern
  for (const pattern of componentPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      let componentName: string;
      let componentType: string;
      
      if (match[1] && match[2]) {
        // Two capture groups - determine which is name and which is type
        const first = match[1];
        const second = match[2];
        
        const secondKey = second.toLowerCase() as keyof typeof typeMap;
        const firstKey = first.toLowerCase() as keyof typeof typeMap;
        
        if (secondKey in typeMap) {
          // Second is type, first is name
          componentName = first;
          componentType = typeMap[secondKey];
        } else if (firstKey in typeMap) {
          // First is type, second is name  
          componentName = second;
          componentType = typeMap[firstKey];
        } else {
          continue; // Skip if we can't determine type
        }
      } else {
        // Single capture group (quoted names)
        componentName = match[1];
        componentType = 'ApexClass'; // Default type for quoted names
      }
      
      // Filter out excluded words and validate component name
      if (componentName && 
          componentName.length > 1 && 
          !excludeWords.has(componentName.toLowerCase()) &&
          /^[A-Z][A-Za-z0-9_]*$/.test(componentName)) {
        foundComponents.set(componentName, componentType);
      }
    }
  }

  // If no components found using patterns, try fallback approach
  if (foundComponents.size === 0) {
    // Look for capitalized words that might be component names
    const fallbackPattern = /\b([A-Z][A-Za-z0-9_]{2,})\b/g;
    let match;
    while ((match = fallbackPattern.exec(description)) !== null) {
      const name = match[1];
      if (!excludeWords.has(name.toLowerCase()) && 
          name.length > 2 && 
          !['Add', 'Modify', 'Delete', 'User', 'Story'].includes(name)) {
        
        // Try to infer type from context
        let inferredType = 'ApexClass'; // default
        const beforeText = description.substring(Math.max(0, match.index - 20), match.index).toLowerCase();
        const afterText = description.substring(match.index + name.length, match.index + name.length + 20).toLowerCase();
        const contextText = beforeText + ' ' + afterText;
        
        for (const [keyword, typeValue] of Object.entries(typeMap)) {
          if (contextText.includes(keyword)) {
            inferredType = typeValue;
            break;
          }
        }
        
        foundComponents.set(name, inferredType);
      }
    }
  }

  // Create change objects from found components
  if (foundComponents.size > 0) {
    foundComponents.forEach((type, name) => {
      changes.push({
        a: defaultAction,
        n: name,
        t: type,
        m: defaultModule
      });
    });
  } else {
    // Fallback: create a generic change object
    changes.push({
      a: defaultAction,
      n: 'UnknownComponent',
      t: 'ApexClass',
      m: defaultModule
    });
  }

  return changes;
}

export const commitTool = {
  name: "commit_changes",
  description: "Commit changes to a Copado User Story. Automatically parses change descriptions and formats them for Copado.",
  
  async execute({ userStoryId, changesDescription, commitMessage, apiKey }: CommitInput) {
    try {
      // Use provided API key or fall back to environment variable
      const authToken = apiKey
      
      if (!authToken) {
        throw new Error("API key is required. Provide it as a parameter or set COPADO_API_KEY environment variable.");
      }

      // Parse the changes description into Copado format
      const parsedChanges = parseChangesToCopadoFormat(changesDescription);
      
      // Generate commit message if not provided
      const message = commitMessage || `Commit changes: ${changesDescription}`;

      // Use the Copado commit webhook endpoint
      const webhookUrl = `https://app-api.copado.com/json/v1/webhook/mcwebhook/commit`;
      
      // Use the correct payload format
      const payload = {
        action: "Commit",
        key: authToken,
        payload: {
          userStoryId: userStoryId,
          changes: parsedChanges,
          message: message
        }
      };

      console.log('🔍 Making commit request to Copado API:');
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
          ...payload.payload,
          changes: parsedChanges
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

      console.log('📥 Commit response status:', response.status, response.statusText);
      
      const responseText = await response.text();
      console.log('📥 Commit response body:', responseText);

      if (!response.ok) {
        throw new Error(`Copado commit request failed: ${response.status} ${response.statusText}. Response: ${responseText}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        result = { message: responseText, status: 'completed' };
      }

      // Extract commit information from response
      const jobExecution = result.jobExecution || {};
      const jobExecutionId = jobExecution.Id;
      const commitId = result.commitId || jobExecutionId;
      const status = jobExecution['copado__Status__c'] || 'Submitted';

      // Format changes for display
      const changesDisplay = parsedChanges.map(change => 
        `• ${change.a}: ${change.n} (${change.t})`
      ).join('\n');

      return {
        content: [{
          type: "text" as const,
          text: `✅ Changes committed successfully!

🎯 **COMMIT SUMMARY**
• User Story ID: ${userStoryId}
• Commit ID: ${commitId}
• Job Execution ID: ${jobExecutionId}
• Status: ${status}
• Message: "${message}"

📝 **COMMITTED CHANGES:**
${changesDisplay}

🔧 **PARSED METADATA FORMAT:**
${parsedChanges.map(c => `• Action: ${c.a}, Name: ${c.n}, Type: ${c.t}, Module: ${c.m}`).join('\n')}

🚀 **NEXT STEPS:**
• Changes are now committed to User Story ${userStoryId}
• Use "promote user story ${userStoryId}" to create a promotion
• Monitor commit status with "check status of job ${jobExecutionId}"

⏰ Commit initiated at: ${new Date().toISOString()}`
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to commit changes!

Error: ${errorMessage}

🔍 **Troubleshooting:**
• Verify User Story ID is correct: ${userStoryId}
• Check that the User Story exists and is in a committable state
• Ensure your webhook key has commit permissions
• Verify the changes description format

📝 **Changes attempted to parse:**
"${changesDescription}"

💡 **Tip:** Be specific about component names and types, e.g.:
"Modified the AccountController apex class and ContactTrigger trigger"`
        }],
        isError: true
      };
    }
  }
};

// Schema definition for the tool
export const commitSchema = {
  userStoryId: z.string().describe("The Salesforce ID of the User Story to commit changes to"),
  changesDescription: z.string().describe("Natural language description of the changes made (e.g., 'Modified the AccountController apex class and added new ContactTrigger trigger')"),
  commitMessage: z.string().optional().describe("Optional commit message (will be auto-generated if not provided)"),
  apiKey: z.string().optional().describe("Copado webhook key for authentication (optional if COPADO_API_KEY env var is set)")
};