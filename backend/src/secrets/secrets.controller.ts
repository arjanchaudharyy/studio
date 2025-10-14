import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { SecretsService } from './secrets.service';
import {
  CreateSecretDto,
  RotateSecretDto,
  SecretSummaryResponse,
  SecretValueResponse,
} from './secrets.dto';

@ApiTags('secrets')
@Controller('secrets')
export class SecretsController {
  constructor(private readonly secretsService: SecretsService) {}

  @Get()
  @ApiOkResponse({ type: [SecretSummaryResponse] })
  async listSecrets(): Promise<SecretSummaryResponse[]> {
    return this.secretsService.listSecrets();
  }

  @Get(':id')
  @ApiOkResponse({ type: SecretSummaryResponse })
  async getSecret(@Param('id', new ParseUUIDPipe()) id: string): Promise<SecretSummaryResponse> {
    return this.secretsService.getSecret(id);
  }

  @Get(':id/value')
  @ApiOkResponse({ type: SecretValueResponse })
  async getSecretValue(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('version') version?: string,
  ): Promise<SecretValueResponse> {
    const parsedVersion = version !== undefined ? Number(version) : undefined;
    if (parsedVersion !== undefined && Number.isNaN(parsedVersion)) {
      throw new BadRequestException('version must be a number');
    }
    return this.secretsService.getSecretValue(id, parsedVersion);
  }

  @Post()
  @ApiCreatedResponse({ type: SecretSummaryResponse })
  async createSecret(@Body() body: CreateSecretDto): Promise<SecretSummaryResponse> {
    return this.secretsService.createSecret(body);
  }

  @Put(':id/rotate')
  @ApiOkResponse({ type: SecretSummaryResponse })
  async rotateSecret(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RotateSecretDto,
  ): Promise<SecretSummaryResponse> {
    return this.secretsService.rotateSecret(id, body);
  }
}
