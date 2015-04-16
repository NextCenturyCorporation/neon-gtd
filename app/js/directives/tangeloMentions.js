
/**
 * Create an angular module that uses Tangelo mentions.
 */
angular.module('neonDemo.directives')
.directive('tangeloMentions', ['DatasetService', 'FilterService', '$timeout', function(datasetService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/tangeloMentions.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, $element) {
            $element.addClass('tangelo-mentions');

            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            $scope.messenger = new neon.eventing.Messenger();

            var chartOptions = $element.find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            $scope.databaseName = "";
            $scope.tables = [];
            $scope.filterItem = "";
            $scope.filterKeys = {};

            var initialize = function() {

                // Setup a neon messenger to listen for dataset and filter change events.
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);

                // Remove our event handlers when we're removed from the DOM
                $scope.$on('$destroy', function() {
                    clearNeonFilter();
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

            var onFiltersChanged = function(message) {
                XDATA.activityLogger.logSystemActivity('TangeloMentions - received neon filter changed event');
                if(message.addedFilter.databaseName === twitter.mentionsDatabase && message.addedFilter.tableName === twitter.mentionsCollection) {
                    $("#update").click();
                }
            };

            var onDatasetChanged = function() {
                XDATA.activityLogger.logSystemActivity('TangeloMentions - received neon-gtd dataset changed event');
                displayActiveDataset();
            };

            var displayActiveDataset = function() {
                if(!datasetService.hasDataset()) {
                    return;
                }

                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.filterItem = "";
                $scope.filterKeys = filterService.createFilterKeys("tangelo-mentions", $scope.tables);
            };

            // this method is called when a user clicks on a node in the graph. There is a
            // mode where the user has elected to re-center around clicked nodes, and this
            // can be enabled/disabled through a UI checkbox, so examine the state variable
            // to decide if any action should be taken. This method is always called because
            // callbacks are alwayw placed on the nodes.
            var updateNeonFilter = function(twitterMentionsCollectionName, item, callback) {
                if($scope.messenger) {
                    if(item) {
                        $scope.filterItem = item;
                        // TODO This won't work if the twitter mentions collection is in a different database than the rest of the dataset.
                        var relations = datasetService.getRelations(twitterMentionsCollectionName, ["source"]);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, createNeonFilter, function() {
                            console.log("Mentions: neon filter set on " + item);
                            if(callback) {
                                callback();
                            }
                        });
                    } else {
                        $scope.filterItem = "";
                        filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                            console.log("Mentions: neon filter removed");
                            if(callback) {
                                callback();
                            }
                        })
                    }
                }
            };

            var createNeonFilter = function(tableName, fieldNames) {
                var fieldName = fieldNames[0];
                var filterClause = neon.query.where(fieldName, '=', $scope.filterItem);
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(filterClause);
            };

            var clearNeonFilter = function() {
                if($scope.messenger) {
                    $scope.filterItem = "";
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, function() {
                        console.log("Mentions: neon filter cleared");
                    })
                }
            };

            neon.ready(function() {
                $scope.messenger = new neon.eventing.Messenger();

                twitter.sourceRecorder = new TweeterHistory({
                    indexMode: "source"
                });

                twitter.targetRecorder = new TweeterHistory({
                    indexMode: "target"
                });

                displayActiveDataset();

                initializeNeon(updateNeonFilter);

                initialize();
                //$timeout(firstTimeInitialize);
                firstTimeInitialize($element[0]);
            });
        }
    };
}]);
