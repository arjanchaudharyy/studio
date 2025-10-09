import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { componentRegistry } from './registry';

@ApiTags('components')
@Controller('components')
export class ComponentsController {
  @Get()
  @ApiOkResponse({
    description: 'List all registered components',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'core.file.loader' },
          name: { type: 'string', example: 'File Loader' },
          description: { type: 'string', example: 'Load files from filesystem' },
          category: { type: 'string', example: 'input-output' },
          runner: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['inline', 'docker', 'remote'],
                example: 'inline',
              },
            },
          },
          inputSchema: {
            type: 'object',
            description: 'JSON Schema for component inputs',
          },
          outputSchema: {
            type: 'object',
            description: 'JSON Schema for component outputs',
          },
        },
      },
    },
  })
  listComponents() {
    const components = componentRegistry.list();

    // Transform to frontend-friendly format
    return components.map((component) => ({
      id: component.id,
      name: component.name,
      description: component.description,
      category: component.category,
      runner: component.runner,
      inputSchema: component.inputSchema,
      outputSchema: component.outputSchema,
    }));
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Get a specific component by ID',
  })
  getComponent(@Param('id') id: string) {
    const component = componentRegistry.get(id);

    if (!component) {
      throw new NotFoundException(`Component ${id} not found`);
    }

    return {
      id: component.id,
      name: component.name,
      description: component.description,
      category: component.category,
      runner: component.runner,
      inputSchema: component.inputSchema,
      outputSchema: component.outputSchema,
    };
  }
}

