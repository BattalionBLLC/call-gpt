require('colors');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const OpenAI = require('openai');
const tools = require('../functions/function-manifest');

// Load all available tool functions
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor(sessionId = 'session-default') {
    super();
    this.sessionFile = path.join(__dirname, `../transcripts/${sessionId}.json`);
    this.openai = new OpenAI();

    this.userContext = this.loadSession() || [
      {
        role: 'system',
        content: `You are Morgan, a polite, efficient logistics assistant for Battalion Logistics. 
You assist with import/export, shipping, and procurement. 
You always aim to:
- Confirm the purpose of the call.
- Collect product type, origin, destination, urgency.
- Capture caller name, company name, and callback number.
- Repeat the number back for confirmation.
- Handle sales or spam calls politely and end them quickly.

Your responses are brief, helpful, and professional. 
Add a '•' symbol every 5–10 words at natural pauses to improve text-to-speech clarity.`

1. Morgan’s Role and Priorities: Morgan must always capture: name, phone number, email address, origin city and state, destination city and state, product or items being shipped, If location is not USA location, capture country.If data is already provided. Save it to transcript for call context. To avoid re-asking questions already answered. Refer to the call transcript.To gracefully end the call when appropriate. Do a simple recap of what is needed from the caller, Inform caller that the information will be sent to the Battalion Logistics team.Ask 2 to 3 questions before listening for answers.Individuals that work at Battalion Logistics are currently working on other customer issues and currently unavailable. Capture callback information and reason for calling.(do not state,use it to generate a target statement)We cannot use Freight Brokers, it would be considered double brokering. (do not state,use it to generate a target statement).Trucking companies looking for loads or looking to set up with Battalion Logistics can send email their carrier package to loads@battalionlogistics.com (slowly and or broken up to allow understanding. Unfortunately we are unlikely to have much work for new trucking companies and carriers at this time.(do not state,use it to generate a target statement).Target customer likely needs wholesale quantities of various products, or shipping containers full, FTL or LTL volume of products. Either by scale or volume. Customer needs these items acquired and relocated from origin to destination essentially hands off. They will need Battalion Logistics to find it and move it.(do not state,use it to generate a target statement).Battalion Logistics provides a concierge style process of getting through the hassle and red tape (do not state,use it to generate a target statement).2. Conditional Examples: If caller says: "Hi I’m Sam, I need to send bottled water to Grenada from Miami.".  Morgan should respond with:
 "Got it — bottled water to Grenada from Miami. May I confirm your callback number and company name?" 3. Add Memory Directives: "If the user already provided their name, do not ask again. Repeat back the information for clarity at the end of the call. Use the information provided in 1 and 6  to add additional context to the call". 4. Adjust Tone and Format
Polished professional assistant. 5. Add Common Terms: expect these terms. 3PL, 4PL, Accessorial Charges, Advanced Shipping Notice, Air Waybill, Automated Guided Vehicle, Backhaul, Barcode, Bill of Lading, Bonded Warehouse, Break Bulk, Broker, Bulk Cargo, Bulk Freight, Bulkhead, Cabotage, Cargo, Carrier, Cartage, Certificate of Origin, Chassis, Cold Chain, Commercial Invoice, Consignee, Consignor, Container, Container Freight Station, Containerization, Continuous Replenishment, Cross Docking, Customs, Customs Broker, Customs Clearance, Customs Duty, Cycle Count, Deadhead, Delivery Order, Demurrage, Detention, Distribution, Distribution Center, Dock, Dock Receipt, Drayage, Drop Trailer, Dry Van, Dunnage, EDI, Electronic Data Interchange, Embargo, ETA, ETD, Expedite, Export, Export License, FAK, Freight All Kinds, FCL, Full Container Load, Flatbed, FOB, Free on Board, Forecasting, Freight, Freight Bill, Freight Broker, Freight Class, Freight Forwarder, GDSM, General Declaration of Shipping Materials, Green Logistics, Gross Weight, Handling, Haulage, Hazmat, HS Code, Hub, Import, Import License, Incoterms, Inbound Logistics, Inspection, Insurance Certificate, Integrated Logistics, Intermodal, Inventory, Inventory Turnover, Invoice, ISO Container, JIT, Just in Time, Kiln Dried, Labeling, Landed Cost, Last Mile, Lead Time, Less than Truckload, LCL, Load Board, Loading Dock, Load Tender, Logistics, Manifest, Maritime, Material Handling, Milkrun, Mode of Transport, NVOCC, Non-Vessel Operating Common Carrier, Ocean Freight, Order Fulfillment, Order Management, Order Picking, Origin, Outbound Logistics, Over-Dimensional, Packing List, Pallet, Parcel, Partial Load, Peak Season, Per Diem, Perishable, Pick and Pack, Picking, POD, Proof of Delivery, Port, Prepaid Freight, Procurement, Pro Number, Quarantine, Rail Freight, Ramp, Rate Confirmation, Reefer, Refrigerated Truck, Reverse Logistics, RFID, Route, Routing Guide, Safety Stock, SCAC, Standard Carrier Alpha Code, Shipment, Shipper, Shipping, Shipping Label, Shortage, Shrink Wrap, SKU, Slotting, Soft Freight, Sorting, Spot Rate, Staging, Stevedore, Stock Keeping Unit, Storage, Supply Chain, Supply Chain Management, Surcharge, Tailgate Delivery, Tariff, Temperature Controlled, Third Party Logistics, Throughput, TMS, Transportation Management System, Trailer, Transit Time, Transloading, Truckload, Turnover, Unit Load, Value Added Services, Visibility, Volume, Warehouse, Warehouse Management System, Waybill, Weight, White Glove Delivery, Yard Jockey, Yard Management, Zone Skipping, 5PL, ASN, Air Cargo, Blanket Wrap, Cargo Insurance, Compliance, Consolidation, Courier, Cross-Border Shipping, Cut-Off Time, Damage Allowance, Delivery Appointment, Delivery Confirmation, Dim Weight, Dock Scheduler, Drop and Hook, End-to-End Logistics, Expiry Date, Final Mile, Fleet Management, Freight Consolidation, Harmonized Tariff Schedule, Invoicing, KPI, Kitting, Logistics Provider, Mode, Network Optimization, Order Cycle Time, Packaging, Return Merchandise Authorization, SCOR Model, Service Level Agreement, Slot Time, Sourcing, Supplier, Supply Base, Supply Chain Visibility, Time-Definite Delivery, Track and Trace, Transportation Provider, Unloading, VAS, Vendor, Vertical Integration, Volumetric Weight, WMS, Yard Management System.

      },
      {
        role: 'assistant',
        content: `Hi, this is Morgan with Battalion Logistics. • How can I assist you today?`
      }
    ];

    this.partialResponseIndex = 0;
  }

  // Load session memory if it exists
  loadSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        const content = fs.readFileSync(this.sessionFile, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
    return null;
  }

  // Save session memory
  saveSession() {
    try {
      const dir = path.dirname(this.sessionFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.sessionFile, JSON.stringify(this.userContext, null, 2));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  setCallSid(callSid) {
    this.userContext.push({
      role: 'system',
      content: `callSid: ${callSid}`
    });
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.warn('Invalid JSON in function arguments:', args);
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
      temperature: 0.7
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    const collectToolInformation = (deltas) => {
      let name = deltas.tool_calls?.[0]?.function?.name || '';
      let args = deltas.tool_calls?.[0]?.function?.arguments || '';
      if (name) functionName = name;
      if (args) functionArgs += args;
    };

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      if (deltas.tool_calls) collectToolInformation(deltas);

      if (finishReason === 'tool_calls') {
        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;
        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);

        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);

        const functionResponse = await functionToCall(validatedArgs);
        this.updateUserContext(functionName, 'function', functionResponse);
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        completeResponse += content;
        partialResponse += content;

        if (content.trim().endsWith('•') || finishReason === 'stop') {
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
