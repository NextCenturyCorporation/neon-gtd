nAnomalyDetectionTs <- function(data) {
    require("AnomalyDetection")
    result <- AnomalyDetectionTs(as.data.frame(list(timestamp=as.POSIXlt(data$timestamp), count=data$count)), max_anoms=0.02, direction='both', plot=FALSE, verbose=TRUE)
    result$anoms
}
