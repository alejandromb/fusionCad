#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const API_BASE = process.env.FUSIONCAD_API_URL || 'http://localhost:3001';
const server = createServer(API_BASE);
const transport = new StdioServerTransport();
await server.connect(transport);
