import type { Database } from 'bun:sqlite';

type CreateSubscribersDbArgs = {
  db: Database;
  generateId: () => string;
};

export const createSubscribersDb = ({ db, generateId }: CreateSubscribersDbArgs) => {
  const addSubscriber = (email: string, name: string) => {
    const now = Date.now();
    db.query('INSERT INTO subscribers (id, email, name, subscribedAt) VALUES (?, ?, ?, ?)')
      .run(generateId(), email.toLowerCase().trim(), name || '', now);
    return { success: true, message: 'Subscribed successfully', subscribedAt: now };
  };

  const listSubscribers = () => {
    return db.query('SELECT email, name, subscribedAt FROM subscribers ORDER BY subscribedAt DESC').all() as any[];
  };

  const exportSubscribersCsv = () => {
    const subscribers = listSubscribers();
    return ['Email,Name,Subscribed At', ...subscribers.map(s => `${s.email},"${s.name || ''}",${new Date(s.subscribedAt).toISOString()}`)].join('\n');
  };

  return {
    addSubscriber,
    listSubscribers,
    exportSubscribersCsv,
  };
};
