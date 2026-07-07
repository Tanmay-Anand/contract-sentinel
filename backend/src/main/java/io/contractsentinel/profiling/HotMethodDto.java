package io.contractsentinel.profiling;

public record HotMethodDto(int rank, String frame, long samples, double percentage) {

    public static HotMethodDto from(HotMethod h) {
        return new HotMethodDto(h.getRank(), h.getFrame(), h.getSampleCount(), h.getPercentage());
    }
}
