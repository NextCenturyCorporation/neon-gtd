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
            $scope.tableNames = [];
            $scope.selectedNodeTableName = "";
            $scope.selectedLinkTableName = "";
            $scope.nodeTable = {};
            $scope.linkTable = {};
            $scope.nodes = [];
            $scope.links = [];
            $scope.numberOfNodesInGraph = 0;
            $scope.nodeLimit = 500;
            $scope.errorMessage = undefined;

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
                $scope.messenger.subscribe("dataset_changed", onDatasetChanged);
                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                });
                element.resize(function() {
                    if($scope.resizePromise) {
                        $timeout.cancel($scope.resizePromise);
                    }
                    $scope.resizePromise = updateSize();
                });
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
                var tables = datasetService.getTables();
                for (var i = 0; i < tables.length; i++) {
                    $scope.tableNames.push(tables[i].name);
                }

                if(initializing) {
                    $scope.updateTablesAndQuery();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTablesAndQuery();
                    });
                }
            };

            $scope.updateTablesAndQuery = function() {
                $scope.nodeTable = datasetService.getTableWithName($scope.selectedNodeTableName) || "";
                $scope.linkTable = datasetService.getTableWithName($scope.selectedLinkTableName) || "";
                $scope.queryForData();
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
                $scope.graph.updateGraph(graphData);
            };

            /**
            * Graph data may not exist in the form that the D3 chart wants, and thus might need some formatting.
            */
            function formatGraphData() {
                var nodeMappings = $scope.nodeTable.mappings;
                var linkMappings = $scope.linkTable.mappings;
                var nodes = [];
                for (var i = 0; i < $scope.nodes.length; i++) {
                    nodes.push(formatNodeOrLink($scope.nodes[i], nodeMappings));
                }

                var links = [];
                for (var i = 0; i < $scope.links.length; i++) {
                    var link = $scope.links[i];
                    var formattedLink = formatNodeOrLink($scope.links[i], linkMappings);
                    var sourceNode = nodes.filter(function(node) { return node.id === link.source; })[0];
                    var targetNode = nodes.filter(function(node) { return node.id === link.target; })[0];
                    formattedLink.source = sourceNode;
                    formattedLink.target = targetNode;
                    links.push(formattedLink);
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

            // Wait for neon to be ready, the create our messenger and intialize the view and data.
            neon.ready(function() {
                $scope.initialize();
                $scope.displayActiveDataset(true);
            });
        }
    };
}]);
