// ai/rubric-scorer.js - Optimized Government-Grade Rubric Scoring
// Works for BOTH voice and chat conversations
// Uses GPT-4o-mini for 96% cost savings vs GPT-4o

import OpenAI from 'openai';
import logger from '../services/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Government-Grade Rubric Scoring Template
 * Optimized for Australian local council compliance
 */
const GOVERNMENT_RUBRIC_TEMPLATE = {
  dimensions: [
    {
      name: "Governance & Compliance",
      weight: 25,
      criteria: `
        - Adherence to council policies and procedures
        - Proper authorization and escalation protocols
        - Privacy and data protection compliance (Australian Privacy Principles)
        - Accurate representation of council authority
        - No unauthorized commitments or promises
      `
    },
    {
      name: "Information Accuracy",
      weight: 25,
      criteria: `
        - Factual correctness of information provided
        - Proper citation of policies, regulations, or ordinances
        - No misinformation or assumptions
        - Appropriate disclaimers when uncertain
        - Verification of resident details before disclosing information
      `
    },
    {
      name: "Service Quality",
      weight: 20,
      criteria: `
        - Professional and courteous tone
        - Active listening and understanding of resident needs
        - Clear and concise communication
        - Appropriate language for diverse community
        - Timely responses and follow-through
      `
    },
    {
      name: "Problem Resolution",
      weight: 20,
      criteria: `
        - Complete understanding of resident's issue
        - Appropriate resolution or escalation
        - Clear next steps provided
        - Resident confirmation of understanding
        - Follow-up arrangements when needed
      `
    },
    {
      name: "Accountability & Transparency",
      weight: 10,
      criteria: `
        - Clear identification as AI or staff member
        - Transparent about capabilities and limitations
        - Proper documentation of interactions
        - Appropriate referrals to human staff when needed
        - Clear recording/data usage disclosures
      `
    }
  ],
  scoring_scale: {
    min: 0,
    max: 100,
    excellent: 90,      // Exemplary government service
    good: 80,           // Meets all standards
    satisfactory: 70,   // Acceptable with minor issues
    needs_improvement: 60,  // Requires training/review
    poor: 50            // Fails compliance standards
  }
};

/**
 * Convert structured rubric to detailed scoring prompt
 */
function buildScoringPrompt(rubric, conversationType) {
  const isVoice = conversationType === 'voice';

  let prompt = `# CONVERSATION ANALYSIS RUBRIC\n\n`;
  prompt += `**Conversation Type:** ${isVoice ? 'VOICE CALL' : 'TEXT CHAT'}\n\n`;
  prompt += `## SCORING DIMENSIONS\n\n`;
  prompt += `Score each dimension on 0-100 scale based on criteria below:\n\n`;

  rubric.dimensions.forEach((dimension, index) => {
    prompt += `### ${index + 1}. ${dimension.name} (Weight: ${dimension.weight}%)\n`;
    prompt += `**Criteria:**${dimension.criteria}\n\n`;

    // Add voice-specific considerations
    if (isVoice) {
      prompt += `**Voice-Specific:**\n`;
      prompt += `- Clarity of speech and articulation\n`;
      prompt += `- Appropriate pacing and pauses\n`;
      prompt += `- Professional vocal tone\n`;
      prompt += `- Effective handling of interruptions\n\n`;
    } else {
      prompt += `**Chat-Specific:**\n`;
      prompt += `- Proper grammar and spelling\n`;
      prompt += `- Appropriate use of formatting\n`;
      prompt += `- Clear message structure\n`;
      prompt += `- Timely responses\n\n`;
    }
  });

  prompt += `\n## SCORING SCALE\n`;
  prompt += `- 90-100: Exemplary - Exceeds all standards\n`;
  prompt += `- 80-89: Good - Meets all standards consistently\n`;
  prompt += `- 70-79: Satisfactory - Meets standards with minor issues\n`;
  prompt += `- 60-69: Needs Improvement - Below standards, requires review\n`;
  prompt += `- 0-59: Poor - Fails to meet compliance standards\n\n`;

  prompt += `## MANDATORY FLAGS\n\n`;
  prompt += `Flag conversations that contain:\n\n`;
  prompt += `- **policy_violation:** Incorrect policy information or unauthorized commitments\n`;
  prompt += `- **privacy_breach:** Potential privacy or data protection issues\n`;
  prompt += `- **requires_escalation:** Complex issues needing human intervention\n`;
  prompt += `- **resident_complaint:** Expression of dissatisfaction or complaint\n`;
  prompt += `- **incomplete_resolution:** Unresolved resident needs\n`;
  prompt += `- **training_opportunity:** Clear areas for AI improvement\n`;
  prompt += `- **compliance_risk:** Potential legal or regulatory concerns\n`;
  prompt += `- **abrupt_ending:** Call ended suddenly without proper closure/goodbye\n`;
  prompt += `- **no_engagement:** User did not respond meaningfully or hung up immediately\n`;
  prompt += `- **technical_issue:** Evidence of audio/technical problems in conversation\n\n`;

  prompt += `## CALL QUALITY EVALUATION (CRITICAL FOR VOICE)\n\n`;
  prompt += `Evaluate call quality indicators:\n`;
  prompt += `- **call_duration_assessment:** Was the call unreasonably short (< 30 seconds of meaningful exchange)?\n`;
  prompt += `- **conversation_completeness:** Did the conversation reach a natural conclusion?\n`;
  prompt += `- **user_engagement_level:** Did the user participate meaningfully beyond initial contact?\n`;
  prompt += `- **proper_closure:** Was there a proper goodbye/closing statement from both parties?\n`;
  prompt += `- **abrupt_hangup_detected:** Did the user or AI end call mid-sentence or without closure?\n\n`;

  prompt += `**SCORING PENALTY RULES:**\n`;
  prompt += `- If user hung up immediately with no meaningful exchange: Score 0-20\n`;
  prompt += `- If call ended abruptly mid-conversation: Reduce score by 30-50 points\n`;
  prompt += `- If no proper closing/goodbye: Reduce score by 10-20 points\n`;
  prompt += `- If only AI spoke with no user response: Score 0-30\n\n`;

  prompt += `## SENTIMENT ANALYSIS\n\n`;
  prompt += `Analyze:\n`;
  prompt += `- Overall resident sentiment (positive/neutral/negative/escalated)\n`;
  prompt += `- Sentiment progression throughout conversation\n`;
  prompt += `- Satisfaction indicators\n`;
  prompt += `- Emotional tone (calm/frustrated/angry/satisfied)\n\n`;

  prompt += `## RESIDENT INTENT EXTRACTION\n\n`;
  prompt += `Extract and categorize all resident questions/intents:\n`;
  prompt += `- Primary intent (main reason for contact)\n`;
  prompt += `- Secondary intents (additional questions/concerns)\n`;
  prompt += `- Intent category (e.g., billing, permits, waste, roads, parks)\n`;
  prompt += `- Resolution status per intent\n\n`;

  prompt += `## SUCCESS EVALUATION\n\n`;
  prompt += `Determine if conversation was successful:\n`;
  prompt += `- Was primary need addressed?\n`;
  prompt += `- Did resident receive accurate information?\n`;
  prompt += `- Were next steps clearly communicated?\n`;
  prompt += `- Was appropriate escalation made if needed?\n`;
  prompt += `- Would resident be satisfied with outcome?\n\n`;

  return prompt;
}

/**
 * Score a conversation using GPT-4o-mini with configurable rubric
 * Works for both voice and chat conversations
 */
export async function scoreConversation(options) {
  const {
    transcript,           // String or array of messages
    rubric = null,        // Custom rubric or use government default
    conversationType = 'chat',  // 'voice' or 'chat'
    organizationName = 'Council',
    assistantName = 'AI Assistant',
    metadata = {}
  } = options;

  const startTime = Date.now();

  logger.info('Starting rubric scoring', {
    conversationType,
    hasCustomRubric: !!rubric,
    transcriptLength: JSON.stringify(transcript).length
  });

  // Use provided rubric or government template
  const effectiveRubric = rubric || GOVERNMENT_RUBRIC_TEMPLATE;

  // Format transcript
  let transcriptText = '';
  if (typeof transcript === 'string') {
    transcriptText = transcript;
  } else if (Array.isArray(transcript)) {
    transcriptText = transcript
      .map(msg => `${msg.role || msg.speaker || 'unknown'}: ${msg.content || msg.text || ''}`)
      .join('\n');
  } else if (transcript.messages) {
    transcriptText = transcript.messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
  } else {
    transcriptText = JSON.stringify(transcript);
  }

  if (!transcriptText.trim()) {
    throw new Error('No valid transcript provided for scoring');
  }

  // Build scoring prompt
  const rubricPrompt = buildScoringPrompt(effectiveRubric, conversationType);

  const systemPrompt = `You are an expert conversation quality analyst for Australian local government services.

Your role is to objectively evaluate ${conversationType} conversations between residents and AI assistants according to government standards for public service delivery.

Focus on:
- Compliance with government regulations and policies
- Information accuracy and accountability
- Service quality and resident satisfaction
- Privacy and data protection
- Appropriate escalation to human staff

Provide scores based solely on the evidence in the transcript. Be consistent, fair, and thorough.`;

  const userPrompt = `${rubricPrompt}

---

## CONVERSATION TO ANALYZE

**Organization:** ${organizationName}
**Assistant:** ${assistantName}
**Type:** ${conversationType.toUpperCase()}

**TRANSCRIPT:**
\`\`\`
${transcriptText}
\`\`\`

---

## YOUR TASK

Analyze this conversation and provide a detailed evaluation in the following JSON format:

\`\`\`json
{
  "scores": {
    "governance_compliance": 85,
    "information_accuracy": 92,
    "service_quality": 88,
    "problem_resolution": 90,
    "accountability_transparency": 95
  },
  "weighted_total_score": 89.5,
  "grade": "Good",
  "sentiments": {
    "overall_sentiment": "positive",
    "sentiment_progression": ["neutral", "positive", "satisfied"],
    "resident_satisfaction": "high",
    "emotional_tone": "calm_professional"
  },
  "flags": {
    "policy_violation": false,
    "privacy_breach": false,
    "requires_escalation": false,
    "resident_complaint": false,
    "incomplete_resolution": false,
    "training_opportunity": false,
    "compliance_risk": false,
    "abrupt_ending": false,
    "no_engagement": false,
    "technical_issue": false
  },
  "call_quality": {
    "call_duration_assessment": "adequate",
    "conversation_completeness": "complete",
    "user_engagement_level": "engaged",
    "proper_closure": true,
    "abrupt_hangup_detected": false,
    "meaningful_exchange": true
  },
  "resident_intents": [
    {
      "intent": "rates_inquiry",
      "question": "How do I pay my council rates?",
      "category": "billing_payment",
      "resolution_status": "resolved",
      "primary": true
    }
  ],
  "success_evaluation": {
    "overall_success": true,
    "primary_need_addressed": true,
    "accurate_information": true,
    "clear_next_steps": true,
    "appropriate_escalation": "n/a",
    "resident_satisfaction_likely": true
  },
  "summary": "Professional interaction with complete resolution. Resident received accurate information about rates payment options. All governance standards met.",
  "strengths": [
    "Clear policy citation",
    "Professional tone throughout",
    "Accurate information provided"
  ],
  "improvements": [
    "Could have proactively offered payment plan information"
  ],
  "confidence_score": 92,
  "critical_issues": []
}
\`\`\`

**IMPORTANT:**
- Respond with ONLY valid JSON
- No additional commentary
- Be objective and evidence-based
- Flag any compliance concerns
`;

  // Call GPT-4o-mini (96% cheaper than GPT-4o!)
  logger.info('Calling GPT-4o-mini for scoring');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',  // ⭐ OPTIMIZED: Was gpt-4o
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    temperature: 0,  // ⭐ OPTIMIZED: Was 0.1, now 0 for maximum consistency
    max_tokens: 2500,
    response_format: { type: "json_object" }
  });

  const processingTime = Date.now() - startTime;

  logger.info('GPT-4o-mini scoring complete', {
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    totalTokens: response.usage.total_tokens,
    processingTimeMs: processingTime
  });

  // Parse response
  const scoringData = JSON.parse(response.choices[0].message.content);

  // Calculate costs (GPT-4o-mini pricing)
  const PROMPT_COST = 0.150 / 1_000_000;    // $0.150 per 1M tokens
  const COMPLETION_COST = 0.600 / 1_000_000; // $0.600 per 1M tokens

  const promptCost = response.usage.prompt_tokens * PROMPT_COST;
  const completionCost = response.usage.completion_tokens * COMPLETION_COST;
  const totalCost = promptCost + completionCost;

  return {
    ...scoringData,
    metadata: {
      model: 'gpt-4o-mini',
      conversation_type: conversationType,
      rubric_dimensions: effectiveRubric.dimensions.length,
      processing_time_ms: processingTime,
      tokens: {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens
      },
      cost: {
        prompt: parseFloat(promptCost.toFixed(6)),
        completion: parseFloat(completionCost.toFixed(6)),
        total: parseFloat(totalCost.toFixed(6))
      },
      rubric_source: rubric ? 'custom' : 'government_template',
      scored_at: new Date().toISOString()
    }
  };
}

/**
 * Cost comparison: GPT-4o-mini vs GPT-4o
 *
 * GPT-4o pricing:
 * - Prompt: $2.50 per 1M tokens
 * - Completion: $10.00 per 1M tokens
 *
 * GPT-4o-mini pricing:
 * - Prompt: $0.150 per 1M tokens (94% cheaper!)
 * - Completion: $0.600 per 1M tokens (94% cheaper!)
 *
 * Example conversation (2000 tokens):
 * - GPT-4o: $0.025
 * - GPT-4o-mini: $0.0015
 *
 * **96% cost savings!** 🎉
 */

export { GOVERNMENT_RUBRIC_TEMPLATE };
