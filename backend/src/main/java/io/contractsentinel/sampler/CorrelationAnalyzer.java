package io.contractsentinel.sampler;

/**
 * Classifies the relationship between response size (x) and response time (y) by comparing a
 * linear fit against a log-linear fit. Locally-valid heuristics: weak correlation is "flat",
 * a clearly better log fit is "exponential" (N+1 candidate), otherwise "linear".
 */
public final class CorrelationAnalyzer {

    public record Result(double r, double slope, String classification) {}

    private CorrelationAnalyzer() {}

    public static Result analyze(double[] x, double[] y) {
        int n = x.length;
        double r = pearson(x, y);
        double slope = ols(x, y)[0];

        String classification;
        if (Double.isNaN(r) || Math.abs(r) < 0.3) {
            classification = "flat";
        } else {
            double linearR2 = rSquared(x, y);
            double logR2 = logRSquared(x, y);
            classification = (logR2 - linearR2 > 0.1) ? "exponential" : "linear";
        }
        return new Result(Double.isNaN(r) ? 0.0 : r, Double.isNaN(slope) ? 0.0 : slope, classification);
    }

    private static double pearson(double[] x, double[] y) {
        int n = x.length;
        double mx = mean(x), my = mean(y);
        double cov = 0, vx = 0, vy = 0;
        for (int i = 0; i < n; i++) {
            double dx = x[i] - mx, dy = y[i] - my;
            cov += dx * dy;
            vx += dx * dx;
            vy += dy * dy;
        }
        if (vx == 0 || vy == 0) return Double.NaN;
        return cov / Math.sqrt(vx * vy);
    }

    /** @return {slope, intercept} of the least-squares line y = slope*x + intercept. */
    private static double[] ols(double[] x, double[] y) {
        int n = x.length;
        double mx = mean(x), my = mean(y);
        double sxx = 0, sxy = 0;
        for (int i = 0; i < n; i++) {
            sxx += (x[i] - mx) * (x[i] - mx);
            sxy += (x[i] - mx) * (y[i] - my);
        }
        double slope = sxx == 0 ? Double.NaN : sxy / sxx;
        double intercept = my - slope * mx;
        return new double[]{slope, intercept};
    }

    private static double rSquared(double[] x, double[] y) {
        double[] fit = ols(x, y);
        if (Double.isNaN(fit[0])) return 0;
        return computeR2(x, y, fit[0], fit[1], false);
    }

    private static double logRSquared(double[] x, double[] y) {
        // Fit ln(y) = slope*x + intercept; requires strictly positive y.
        int n = x.length;
        double[] ly = new double[n];
        for (int i = 0; i < n; i++) {
            if (y[i] <= 0) return 0;
            ly[i] = Math.log(y[i]);
        }
        double[] fit = ols(x, ly);
        if (Double.isNaN(fit[0])) return 0;
        return computeR2(x, ly, fit[0], fit[1], false);
    }

    private static double computeR2(double[] x, double[] y, double slope, double intercept, boolean unused) {
        double my = mean(y);
        double ssRes = 0, ssTot = 0;
        for (int i = 0; i < x.length; i++) {
            double pred = slope * x[i] + intercept;
            ssRes += (y[i] - pred) * (y[i] - pred);
            ssTot += (y[i] - my) * (y[i] - my);
        }
        if (ssTot == 0) return 0;
        return 1 - ssRes / ssTot;
    }

    private static double mean(double[] a) {
        double s = 0;
        for (double v : a) s += v;
        return a.length == 0 ? 0 : s / a.length;
    }
}
