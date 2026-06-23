import { handlers } from '@/lib/auth';

// Node.js runtime を明示（bcryptjs と D1 アクセスに必要）
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
