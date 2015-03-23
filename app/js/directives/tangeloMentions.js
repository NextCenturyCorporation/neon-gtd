
/**
 * Create an angular module that uses Tangelo mentions.
 */
angular.module('neonDemo.directives')
.directive('tangeloMentions', ['ConnectionService', '$timeout', function(connectionService, $timeout) {
    return {
        templateUrl: 'partials/directives/tangeloMentions.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, $element) {
            $element.addClass('tangelo-mentions');

            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            $scope.messenger = new neon.eventing.Messenger();
            $scope.database = '';
            $scope.tableName = '';

            var chartOptions = $element.find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            var initialize = function() {

                // Setup a neon messenger to listen for dataset and filter change events.
                $scope.messenger.events({
                    activeDatasetChanged: onDatasetChanged,
                    filtersChanged: onFiltersChanged
                });

                // Remove our event handlers when we're removed from the DOM
                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });

                // Setup a basic resize handler to redraw the map and calculate its size if our div changes.
                // Since the map redraw can take a while and resize events can come in a flood, we attempt to
                // redraw only after a second of no consecutive resize events.
                var redrawOnResize = function() {
                    resizeMentionsGraph($element[0]);
                    $scope.resizePromise = null;
                };

                $element.resize(function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = $timeout(redrawOnResize, $scope.resizeRedrawDelay);
                });
            };

            var onFiltersChanged = function() {
                XDATA.activityLogger.logSystemActivity('TangeloMentions - received neon filter changed event');
                //$scope.queryForData();
            };

            var onDatasetChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('TangeloMentions - received neon dataset changed event');
                $scope.databaseName = message.database;
                $scope.tableName = message.table;
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();

                twitter.sourceRecorder = new TweeterHistory({
                    indexMode: "source"
                });

                twitter.targetRecorder = new TweeterHistory({
                    indexMode: "target"
                });

                initializeNeon();

                initialize();
                //$timeout(firstTimeInitialize);
                firstTimeInitialize($element[0]);
            });
        }
    };
}]);