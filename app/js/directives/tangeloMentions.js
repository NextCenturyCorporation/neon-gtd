
/**
 * Create an angular module that uses Tangelo mentions.
 */
angular.module('neonDemo.directives')
.directive('tangeloMentions', ['ConnectionService', function(connectionService) {
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
            };

            var onFiltersChanged = function() {
                XDATA.activityLogger.logSystemActivity('TangeloMentions - received neon filter changed event');
                //$scope.queryForData();
            };

            var onDatasetChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('TangeloMentions - received neon dataset changed event');
                $scope.databaseName = message.database;
                $scope.tableName = message.table;

                // if there is no active connection, try to make one.
                //connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);

                // Pull data.
                //$scope.displayActiveDataset();
            };

            /**
             * Builds a query to pull a limited set of records that match any existing filter sets.
             * @return neon.query.Query
             * @method buildQuery
             */
            // $scope.buildQuery = function() {
            //     var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.tableName);
            //     if($scope.groupFields.length > 0) {
            //         query.groupBy.apply(query, $scope.groupFields);
            //     }

            //     //take based on selected count or total
            //     query.aggregate(neon.query.COUNT, '*', 'count');
            //     if($scope.valueField) {
            //         query.aggregate(neon.query.SUM, $scope.valueField, $scope.valueField);
            //     }

            //     return query;
            // };

            /**
             * Displays data for any currently active datasets.
             * @method displayActiveDataset
             */
            // $scope.displayActiveDataset = function() {
            //     var connection = connectionService.getActiveConnection();
            //     if(connection) {
            //         connectionService.loadMetadata(function() {
            //             var info = connectionService.getActiveDataset();
            //             $scope.databaseName = info.database;
            //             $scope.tableName = info.table;

            //             connection.getFieldNames($scope.tableName, function(results) {
            //                 $scope.$apply(function() {
            //                     $scope.fields = results;
            //                     $scope.queryForData();
            //                 });
            //             });
            //         });
            //     }
            // };

            // $scope.queryForData = function() {
            //     var connection = connectionService.getActiveConnection();
            //     // if(connection && $scope.groupFields.length > 0) {
            //     if(connection) {
            //         var query = $scope.buildQuery();

            //         XDATA.activityLogger.logSystemActivity('sunburst - query for data');
            //         connection.executeQuery(query, function(queryResults) {
            //             XDATA.activityLogger.logSystemActivity('sunburst - received data');
            //             $scope.$apply(function() {
            //                 $scope.updateChartSize();
            //                 doDrawChart(buildDataTree(queryResults));
            //                 XDATA.activityLogger.logSystemActivity('sunburst - rendered data');
            //             });
            //         });
            //     }
            // };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();
                initialize();
                //$scope.displayActiveDataset();
            });
        }
    };
}]);