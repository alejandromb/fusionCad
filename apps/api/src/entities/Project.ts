import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Connection data structure (matches frontend)
 */
export interface ConnectionData {
  fromDevice: string;
  fromDeviceId?: string;
  fromPin: string;
  toDevice: string;
  toDeviceId?: string;
  toPin: string;
  netId: string;
  sheetId?: string;
  wireNumber?: string;
  waypoints?: { x: number; y: number }[];
}

/**
 * Device position for canvas layout
 */
export interface DevicePosition {
  x: number;
  y: number;
}

/**
 * Complete circuit data stored as JSON
 */
export interface CircuitData {
  devices: unknown[];
  nets: unknown[];
  parts: unknown[];
  connections: ConnectionData[];
  positions: Record<string, DevicePosition>;
  sheets?: unknown[];
  annotations?: unknown[];
  terminals?: unknown[];
  rungs?: unknown[];
  transforms?: Record<string, unknown>;
  blocks?: unknown[];
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId?: string | null;

  @Column({ type: 'jsonb', default: {} })
  circuitData!: CircuitData;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
