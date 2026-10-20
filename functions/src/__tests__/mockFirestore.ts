export class MockDocRef {
  constructor(public id: string, public dataStore: Map<string, any>) {}

  async get() {
    const data = this.dataStore.get(this.id);
    return {
      id: this.id,
      exists: data !== undefined,
      data: () => data,
    };
  }

  async set(data: any, options?: { merge?: boolean }) {
    if (options?.merge && this.dataStore.has(this.id)) {
      this.dataStore.set(this.id, { ...this.dataStore.get(this.id), ...data });
    } else {
      this.dataStore.set(this.id, data);
    }
  }

  async update(data: any) {
    if (!this.dataStore.has(this.id)) {
      throw new Error(`Doc ${this.id} not found.`);
    }
    this.dataStore.set(this.id, { ...this.dataStore.get(this.id), ...data });
  }

  async delete() {
    this.dataStore.delete(this.id);
  }
}

export class MockQuery {
  constructor(
    public collectionName: string,
    public dataStore: Map<string, any>,
    public filters: Array<{ field: string; op: string; value: any }> = [],
    public limitCount?: number
  ) {}

  where(field: string, op: string, value: any) {
    return new MockQuery(
      this.collectionName,
      this.dataStore,
      [...this.filters, { field, op, value }],
      this.limitCount
    );
  }

  limit(count: number) {
    return new MockQuery(this.collectionName, this.dataStore, this.filters, count);
  }

  async get() {
    let docs = Array.from(this.dataStore.entries()).map(([id, data]) => ({
      id,
      data: () => data,
      exists: true,
    }));

    for (const filter of this.filters) {
      docs = docs.filter((d) => {
        const val = d.data()[filter.field];
        if (filter.op === '==') return val === filter.value;
        if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(val);
        return true;
      });
    }

    if (this.limitCount !== undefined) {
      docs = docs.slice(0, this.limitCount);
    }

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

export class MockCollection {
  constructor(public name: string, public rootStore: Map<string, Map<string, any>>) {
    if (!rootStore.has(name)) {
      rootStore.set(name, new Map());
    }
  }

  get dataStore() {
    return this.rootStore.get(this.name)!;
  }

  doc(id?: string) {
    const docId = id || `mock_id_${Math.random().toString(36).substr(2, 9)}`;
    return new MockDocRef(docId, this.dataStore);
  }

  where(field: string, op: string, value: any) {
    return new MockQuery(this.name, this.dataStore, [{ field, op, value }]);
  }

  async get() {
    return new MockQuery(this.name, this.dataStore).get();
  }
}

export function createMockFirestore() {
  const store = new Map<string, Map<string, any>>();

  const db = {
    _store: store,
    collection: (name: string) => new MockCollection(name, store),
    batch: () => ({
      update: (ref: any, data: any) => ref.update(data),
      set: (ref: any, data: any) => ref.set(data),
      delete: (ref: any) => ref.delete(),
      commit: async () => {},
    }),
    runTransaction: async (updateFunction: (transaction: any) => Promise<any>) => {
      const transaction = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any, options?: any) => docRef.set(data, options),
        update: async (docRef: any, data: any) => docRef.update(data),
        delete: async (docRef: any) => docRef.delete(),
      };
      return updateFunction(transaction);
    },
  } as any;

  return db;
}
