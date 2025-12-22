import { z } from 'zod';
import {
  componentRegistry,
  ComponentDefinition,
  port,
} from '@shipsec/component-sdk';
import { getQuickJS, QuickJSContext } from 'quickjs-emscripten';
import { transform } from 'sucrase';

const variableConfigSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'json', 'secret', 'list']).default('json'),
});

const parameterSchema = z.object({
  code: z.string().default('// Write your TypeScript code here\nreturn {};'),
  variables: z.array(variableConfigSchema).optional().default([]),
  returns: z.array(variableConfigSchema).optional().default([]),
});

// Since dynamic inputs are passed at root level of `execute` params, 
// we use passthrough to allow unknown keys (the dynamic variables)
const inputSchema = parameterSchema.passthrough();

type Input = z.infer<typeof inputSchema>;
type Output = Record<string, unknown>;
type Params = z.infer<typeof parameterSchema>;

// Helper to map type string to Port definition
const mapTypeToPort = (type: string, id: string, label: string) => {
  switch (type) {
    case 'string': return { id, label, dataType: port.text(), required: true };
    case 'number': return { id, label, dataType: port.number(), required: true };
    case 'boolean': return { id, label, dataType: port.boolean(), required: true };
    case 'secret': return { id, label, dataType: port.secret(), required: true };
    case 'list': return { id, label, dataType: port.list(port.text()), required: true };
    default: return { id, label, dataType: port.json(), required: true };
  }
};

const definition: ComponentDefinition<Input, Output> = {
  id: 'core.logic.script',
  label: 'Script / Logic',
  category: 'transform',
  runner: { kind: 'inline' },
  inputSchema,
  outputSchema: z.record(z.string(), z.unknown()),
  docs: 'Execute custom TypeScript/JavaScript code in a secure sandbox. Define inputs and outputs to interact with other nodes.',
  metadata: {
    slug: 'logic-script',
    version: '1.0.0',
    type: 'process',
    category: 'transform',
    description: 'Execute custom logic (TypeScript/JS) in a sandbox.',
    icon: 'Code',
    author: { name: 'ShipSecAI', type: 'shipsecai' },
    isLatest: true,
    deprecated: false,
    inputs: [], // Dynamic
    outputs: [], // Dynamic
    parameters: [
      {
        id: 'code',
        label: 'Script Code',
        type: 'textarea',
        rows: 15,
        default: '// return { result: variable1 + 1 };',
        description: 'TypeScript code to execute. Must return an object matching defined Outputs.',
        required: true,
      },
      {
        id: 'variables',
        label: 'Input Variables',
        type: 'json',
        default: [],
        description: 'Define input variables: [{"name": "x", "type": "number"}]',
      },
      {
        id: 'returns',
        label: 'Output Variables',
        type: 'json',
        default: [],
        description: 'Define return variables: [{"name": "result", "type": "number"}]',
      },
    ],
  },
  resolvePorts(params: any) {
    const inputs: any[] = [];
    const outputs: any[] = [];
    
    // Parse variables config
    if (Array.isArray(params.variables)) {
      params.variables.forEach((v: any) => {
        if (v.name) {
          inputs.push(mapTypeToPort(v.type || 'json', v.name, v.name));
        }
      });
    }

    // Parse returns config
    if (Array.isArray(params.returns)) {
      params.returns.forEach((v: any) => {
        if (v.name) {
          outputs.push(mapTypeToPort(v.type || 'json', v.name, v.name));
        }
      });
    }

    return { inputs, outputs };
  },
  async execute(params, context) {
    const { code, variables = [], returns = [] } = params;
    
    // 1. Transpile TS -> JS
    let jsCode = '';
    try {
      const compiled = transform(code, {
        transforms: ['typescript'],
        disableESTransforms: true, // Keep modern JS
      });
      jsCode = compiled.code;
    } catch (err: any) {
      throw new Error(`Compilation Error: ${err.message}`);
    }

    // 2. Prepare Sandbox
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();
    
    let result: any = {};

    try {
      // 3. Inject Inputs
      // We wrap the user code in an IIFE/function to pass variables safely
      // and capture return value.
      
      // Values come from `params` (due to passthrough).
      // We filter params to find input values matching defined variables.
      const inputValues: Record<string, any> = {};
      variables.forEach((v) => {
        if (v.name && params[v.name] !== undefined) {
          inputValues[v.name] = params[v.name];
        }
      });

      // Serialize inputs to JSON to pass into VM
      const inputJson = JSON.stringify(inputValues);
      
      // Create a global 'INPUTS' object in VM
      const vmInputHandle = vm.newString(inputJson);
      const vmJson = vm.getProp(vm.global, 'JSON');
      const vmJsonParse = vm.getProp(vmJson, 'parse');
      const vmInputs = vm.callFunction(vmJsonParse, vm.undefined, vmInputHandle);
      
      vmInputHandle.dispose();
      vmJsonParse.dispose();
      vmJson.dispose(); // Dispose intermediate handles

      if (vmInputs.error) {
        const error = vm.dump(vmInputs.error);
        vmInputs.error.dispose();
        throw new Error(`Input Serialization Error (VM): ${JSON.stringify(error)}`);
      }

      vm.setProp(vm.global, 'INPUTS', vmInputs.value);
      vmInputs.value.dispose();
      
      const varNames = variables.map(v => v.name).join(', ');
      const userScriptWrapped = `
        (function() {
          const { ${varNames} } = INPUTS;
          ${jsCode}
        })()
      `;

      // 5. Execute
      const vmResult = vm.evalCode(userScriptWrapped);
      
      if (vmResult.error) {
        const error = vm.dump(vmResult.error);
        vmResult.error.dispose();
        throw new Error(`Runtime Error: ${JSON.stringify(error)}`);
      }

      // 6. Extract Result
      const handle = vmResult.value;
      const vmJson2 = vm.getProp(vm.global, 'JSON');
      const jsonStringify = vm.getProp(vmJson2, 'stringify');
      const jsonResultHandle = vm.callFunction(jsonStringify, vm.undefined, handle);
      
      vmJson2.dispose();
      jsonStringify.dispose();
      
      if (jsonResultHandle.error) {
         const error = vm.dump(jsonResultHandle.error);
         jsonResultHandle.error.dispose();
         throw new Error(`Result serialization failed: ${JSON.stringify(error)}`);
      }
      
      const jsonString = vm.getString(jsonResultHandle.value);
      
      // Cleanup
      jsonResultHandle.value.dispose();
      handle.dispose();

      result = JSON.parse(jsonString);

    } catch (err) {
      throw err;
    } finally {
      vm.dispose();
    }

    // 7. Validate Outputs
    const finalOutput: Record<string, unknown> = {};
    returns.forEach((r) => {
       if (result && r.name && result[r.name] !== undefined) {
         finalOutput[r.name] = result[r.name];
       } else {
         finalOutput[r.name] = null; // Default null for missing outputs
       }
    });

    return finalOutput;
  },
};

componentRegistry.register(definition);

export { definition };
