'use strict';
/*
 * Copyright 2014 Next Century Corporation
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

angular.module('neonDemo.directives')
.directive('directedGraph',['ConnectionService', 'DatasetService', 'ErrorNotificationService', 'FilterService', '$timeout', function(connectionService, datasetService, errorNotificationService, filterService, $timeout) {
    return {
        templateUrl: 'partials/directives/directedGraph.html',
        restrict: 'EA',
        scope: {
        },
        link: function($scope, element) {
            $scope.uniqueChartOptions = 'chart-options-' + uuid();
            var chartOptions = $(element).find('.chart-options');
            chartOptions.toggleClass($scope.uniqueChartOptions);

            element.addClass('directedGraphDirective');

            $scope.TIMEOUT_MS = 250;
            $scope.uniqueId = uuid();
            $scope.databaseName = "";
            $scope.tables = [];
            $scope.nodeTable = {};
            $scope.linkTable = {};
            $scope.nodes = [];
            $scope.links = [];
            $scope.numberOfNodesInGraph = 0;
            $scope.filterKeys = {};
            $scope.selectedNode = "";
            $scope.nodeLimit = 500;
            $scope.errorMessage = undefined;
            $scope.filteredNodes = [];

            var updateSize = function() {
                var paddingTop = (element.outerHeight(true) - element.height()) / 2;
                var headerHeight = element.find('.config-row-div').outerHeight(true);
                element.find('#directed-graph-div-' + $scope.uniqueId).height(element.height() - paddingTop - headerHeight);
                return $timeout(redraw, $scope.TIMEOUT_MS);
            };

            var redraw = function() {
                if($scope.graph) {
                    $scope.graph.redraw();
                }
                $scope.resizePromise = null;
            };

            $scope.initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);
                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    if($scope.filteredNodes.length) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys);
                    }
                });
                element.resize(function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = updateSize();
                });
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.databaseName && message.addedFilter.tableName === $scope.nodeTable.name) {
                    $scope.queryForData();
                }
            };

            $scope.addFilter = function(value) {
                $scope.selectedNode = "";
                var nodeMappings = $scope.nodeTable.mappings;
                var matchingNodes = $scope.filteredNodes.filter(function(node) {return node[nodeMappings["name"]] === value});
                if(matchingNodes.length > 0) {
                    return;
                }
                $scope.filteredNodes.push(value);
                if($scope.messenger) {
                    var relations = datasetService.getRelations($scope.nodeTable.name, ["name"]);
                    if ($scope.filteredNodes.length === 1) {
                        filterService.addFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    } else if($scope.filteredNodes.length > 1) {
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            /**
             * Creates and returns a filter using the given table and fields.
             * @param {String} The name of the table on which to filter
             * @param {Array} An array containing the name of the selected field as its first element
             * @method createFilter
             * @return {Object} A neon.query.Filter object
             */
            $scope.createFilter = function(tableName, fieldNames) {
                var fieldName = fieldNames[0];
                var fullWhereClause = neon.query.where(fieldName, '=', $scope.filteredNodes[0]);
                for(var i = 1; i < $scope.filteredNodes.length; ++i) {
                    var whereClause = neon.query.where(fieldName, '=', $scope.filteredNodes[i]);
                    fullWhereClause = neon.query.or(fullWhereClause, whereClause);
                }
                return new neon.query.Filter().selectFrom($scope.databaseName, tableName).where(fullWhereClause);
            };

            $scope.removeFilter = function(value) {
                var matchIndex;
                var nodeMappings = $scope.nodeTable.mappings;
                var matchingNodes = $scope.filteredNodes.filter(function(node, index) {
                    var match = node[nodeMappings["name"]] === name;
                    if (match) {
                        matchIndex = index; 
                    }
                    return match;
                });
                if(matchingNodes.length > 0) {
                    return;
                }
                $scope.filteredNodes.splice(index, 1);

                if($scope.messenger) {
                    if($scope.filteredNodes.length === 0) {
                        filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                    } else {
                        var relations = datasetService.getRelations($scope.selectedTable.name, [$scope.selectedNodeField]);
                        filterService.replaceFilters($scope.messenger, relations, $scope.filterKeys, $scope.createFilter, $scope.queryForData);
                    }
                }
            };

            $scope.clearFilters = function() {
                $scope.filteredNodes = [];
                if ($scope.messenger) {
                    filterService.removeFilters($scope.messenger, $scope.filterKeys, $scope.queryForData);
                }
            };

            /**
             * Event handler for dataset changed events issued over Neon's messaging channels.
             * @method onDatasetChanged
             * @private
             */
            var onDatasetChanged = function() {
                $scope.displayActiveDataset(false);
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             */
            $scope.displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset()) {
                    return;
                }
                if(!$scope.graph) {
                    $scope.graph = new charts.DirectedGraph(element[0], ('#directed-graph-div-' + $scope.uniqueId), {
                        clickHandler: $scope.createClickHandler
                    });
                }
                $scope.data = [];
                $scope.databaseName = datasetService.getDatabase();
                $scope.tables = datasetService.getTables();
                $scope.filterKeys = filterService.createFilterKeys("graph", $scope.tables);

                if (initializing) {
                    $scope.queryForData();
                } else {
                    $scope.$apply(function() {
                        $scope.queryForData();
                    });
                }
            };

            /**
             * Query for node and link data
             */
            $scope.queryForData = function() {
                if ($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }
                var handleQueryError = function(response) {
                    $scope.updateGraph([], []);
                    $scope.errorMessage = errorNotificationService.showErrorMessage(element, response.responseJSON.error, response.responseJSON.stackTrace);    
                };
                if($scope.nodeTable.name && $scope.linkTable.name) {
                    var nodeQuery = new neon.query.Query()
                        .selectFrom($scope.databaseName, $scope.nodeTable.name);
                    var linkQuery = new neon.query.Query().selectFrom($scope.databaseName, $scope.linkTable.name);
                    var connection = connectionService.getActiveConnection();
                    if(connection) {
                        connection.executeQuery(nodeQuery, function(data) {
                            $scope.nodes = data.data;
                            connection.executeQuery(linkQuery, function(data) {
                                $scope.links = data.data;
                                $scope.updateGraph();
                            }, handleQueryError);
                        }, handleQueryError);
                    }
                }
            };

            /**
            * Update graph visualization
            */
            $scope.updateGraph = function() {
                var graphData = formatGraphData();
                $scope.$apply(function() {
                    $scope.numberOfNodesInGraph = $scope.nodes.length;
                });
                $scope.graph.setClickableNodes(graphData.nodes);
                $scope.graph.updateGraph(graphData);
            };

            /**
            * Graph data may not exist in the form that the D3 chart wants, and thus might need some formatting.
            * Also enforce node limit on data.
            */
            function formatGraphData() {
                var nodeMappings = $scope.nodeTable.mappings;
                var linkMappings = $scope.linkTable.mappings;
                var limit = $scope.nodes.length;
                if ($scope.nodeLimit < $scope.nodes.length) {
                    limit = $scope.nodeLimit;
                }
                var nodes = [];
                for (var i = 0; i < limit; i++) {
                    nodes.push(formatNodeOrLink($scope.nodes[i], nodeMappings));
                }
                var links = [];
                for (var i = 0; i < $scope.links.length; i++) {
                    var link = formatNodeOrLink($scope.links[i], linkMappings);
                    // Get node associated with the link's source and target ID. Node IDs are assumed to be unique.
                    var matchingSources = nodes.filter(function(node) { return node.id === link.source; });
                    var matchingTargets = nodes.filter(function(node) { return node.id === link.target; });
                    // Due to the enforced node limit, some links may need to be dropped.
                    if (matchingSources.length > 0 && matchingTargets.length > 0) {
                        link.source = matchingSources[0];
                        link.target = matchingTargets[0];
                        links.push(link);
                    }
                }
                return {nodes: nodes, links: links};
            };

            function formatNodeOrLink(obj, map) {
                var formattedObj = {};
                for (var prop in map) {
                    if (map.hasOwnProperty(prop)) {
                        formattedObj[prop] = obj[map[prop]];
                    }
                }
                return formattedObj;
            }

             $scope.createClickHandler = function(item) {
                var nodeMappings = $scope.nodeTable.mappings;
                var matchingNodes = $scope.nodes.filter(function(node) {return node[nodeMappings["name"]] === item.name});
                if(matchingNodes.length > 0) {
                    if ($scope.filteredNodes.indexOf(item.name) === -1) {
                        $scope.$apply(function() {
                            $scope.addFilter(item.name);
                        });
                    } else {
                        $scope.$apply(function() {
                            $scope.removeFilter(item.name);
                        });
                    }
                }
            };

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
