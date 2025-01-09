import { OP } from './utils.js';

export type ASTLiteral<T> = string | number | T;

export interface ASTNode<T = any> {
	[OP]: string;
	left: ASTLiteral<T> | ASTNode<T>;
	right: ASTLiteral<T> | ASTNode<T>;
}

