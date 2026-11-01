import { z } from 'zod';

// The native facade needs only a schema builder and an identity definition helper.
export function tool(definition) { return definition; }
tool.schema = z;
