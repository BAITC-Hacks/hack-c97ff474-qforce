export interface UnitOfWork<TPorts> { run<T>(work: (ports: TPorts) => Promise<T>): Promise<T>; }
