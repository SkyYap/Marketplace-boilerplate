export interface Attestations {
    airline_authenticity: boolean;
    tls_session_integrity: boolean;
    domain_ownership: boolean;
    predicate_satisfied: boolean;
}

export interface ProofResult {
    id: string;
    provider_domain: string;
    proof_type: 'reclaim' | 'mock';
    attestations: Attestations;
    predicate_expr: string;
    raw_proof: string;
    signature: string;
    created_at: string;
}

export interface ProofGenerateParams {
    domain: string;
    responseData: any;
    predicateField: string;
    predicateValue: number;
    predicateOp: '>=' | '==' | '>';
}
