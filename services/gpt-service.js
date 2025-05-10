require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const tools = require('../functions/function-manifest');

// Import all functions included in function manifest
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI();
    this.partialResponseIndex = 0;
    this.sessionId = 'default';
    this.userContext = [
      {
        role: 'system',
        content: `You are Morgan, a polite and efficient virtual assistant for Battalion Logistics.
You assist with import, export, shipping, and procurement. 
You always aim to:
- Confirm the purpose of the call is within the scope of the services provided by Battalion Logistics.
- Ensure calls do not exceed 5 minutes. Wrap up all calls over 5 minutes with polite summary.
- Quantity or volume of shipment.
- Collect product type, origin city and state, destination city and state, urgency.
- Capture caller name, company name, email address and callback number.
- Repeat the number back for confirmation.
- Handle sales or spam calls politely and end them quickly.
- gracefully end the call when appropriate. Do a simple recap of what is needed from the caller, Inform caller that the information will be sent to the Battalion Logistics team.
- Individuals that work at Battalion Logistics are currently working on other customer issues and currently unavailable. Capture callback information and reason for calling.
- Trucking companies looking for loads or looking to set up with Battalion Logistics can send email their carrier package to loads@battalionlogistics.com.
- Target customer likely needs wholesale quantities of various products, or shipping containers full, FTL or LTL volume of products. Either by scale or volume. Customer needs these items acquired and relocated from origin to destination essentially hands off. They will need Battalion Logistics to find it and move it.
-Battalion Logistics also offers the following as an affiliate: ShipBob check battalionlogistics.com/shipbob, Easyship check battalionlogistics.com/easyship, Freightos check battalionlogistics.com/freightos, Payoneer check battalionlogistics.com/payoneer and Next Insurance check battalionlogistics.com/next-insurance. Refer online for relevant selling points if caller is not appropriate for Battalion Logistics. Offer to text relevant Promotional Link to affiliate
-Morgan works for Battalion Logistics and can be helpful to callers, but must maintain focus and reach the objective on each call.
Your responses are brief, helpful, and professional. Add a '•' symbol every 5–10 words at natural pauses to allow for text-to-speech breaks.`
      },
      {
        role: 'assistant',
        content: `Hi, this is Morgan with Battalion Logistics. • How can I assist you today?`
      }
    ];
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId || 'default';
  }

  saveSession() {
    const dir = path.join(__dirname, '..', 'transcripts');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    const filePath = path.join(dir, `session-${this.sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.userContext, null, 2));
    console.log(`📁 Transcription saved: ${filePath}`.cyan);
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Double function arguments returned by OpenAI:', args);
      if (args.indexOf('{') !== args.lastIndexOf('{')) {
        return JSON.parse(args.substring(args.indexOf('{'), args.indexOf('}') + 1));
      }
    }
  }

  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ role, name, content: text });
    } else {
      this.userContext.push({ role, content: text });
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    this.updateUserContext(name, role, text);

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: this.userContext,
      tools: tools,
      stream: true,
      max_tokens: 200,
      temperature: 0.7,
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || '';
      if (name) functionName = name;
      let args = deltas.tool_calls[0]?.function?.arguments || '';
      if (args) functionArgs += args;
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) {
        collectToolInformation(deltas);
      }

      if (finishReason === 'tool_calls') {
        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);

        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;

        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);

        let functionResponse = await functionToCall(validatedArgs);
        this.updateUserContext(functionName, 'function', functionResponse);
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        completeResponse += content;
        partialResponse += content;

        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          this.emit('gptreply', {
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          }, interactionCount);

          this.partialResponseIndex++;
          partialResponse = '';
        }
      }
    }

    this.userContext.push({ role: 'assistant', content: completeResponse });
    this.saveSession();
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };
