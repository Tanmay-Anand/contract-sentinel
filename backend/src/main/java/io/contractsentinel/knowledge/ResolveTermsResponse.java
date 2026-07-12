package io.contractsentinel.knowledge;

import java.util.List;

public record ResolveTermsResponse(
        String originalText,
        List<ResolvedTerm> resolvedTerms
) {
    public record ResolvedTerm(
            String term,
            GraphSynonym.TargetType targetType,
            String targetName,
            String serviceName
    ) {}
}
