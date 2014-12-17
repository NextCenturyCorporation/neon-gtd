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

/**
 * This directive adds a barchart to the DOM and drives the visualization data from
 * whatever database and table are currently selected in neon.  This directive accomplishes that
 * by using getting a neon connection from a connection service and listening for
 * neon system events (e.g., data tables changed).  On these events, it requeries the active
 * connection for data and updates applies the change to its scope.  The contained
 * barchart will update as a result.
 * @class neonDemo.directives.barchart
 * @constructor
 */
angular.module('neonDemo.directives')
.directive('sunburst', ['ConnectionService', function(connectionService) {
	return {
		templateUrl: 'partials/directives/sunburst.html',
		restrict: 'EA',
		scope: {
		},
		link: function($scope, el) {
			el.addClass('sunburst-directive');

			$scope.selectedItem = "";
			$scope.groupFields = [];
			$scope.messenger = new neon.eventing.Messenger();
			$scope.database = '';
			$scope.tableName = '';
			$scope.fields = [""];
			$scope.chart = undefined;

			var initialize = function() {
				$scope.chart = new charts.SunburstChart(el[0], '.sunburst-chart');
				$scope.chart.drawBlank();

				$scope.messenger.events({
					activeDatasetChanged: onDatasetChanged,
					filtersChanged: onFiltersChanged
				});
			};

			var onFiltersChanged = function() {
				XDATA.activityLogger.logSystemActivity('BarChart - received neon filter changed event');
				$scope.queryForData();
			};

			var onDatasetChanged = function(message) {
				XDATA.activityLogger.logSystemActivity('BarChart - received neon dataset changed event');
				$scope.databaseName = message.database;
				$scope.tableName = message.table;

				// if there is no active connection, try to make one.
				connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);

				// Pull data.
				$scope.displayActiveDataset();
			};

			/**
			 * Builds a query to pull a limited set of records that match any existing filter sets.
			 * @return neon.query.Query
			 * @method buildQuery
			 */
			$scope.buildQuery = function() {
				var query = new neon.query.Query().selectFrom($scope.databaseName, $scope.tableName);
				query.groupBy.apply(query, $scope.groupFields);
				//for each groupFields add groupBy

				//take based on selected count or total
				query.aggregate(neon.query.COUNT, '*', 'count');

				return query;
			};

			/**
			 * Displays data for any currently active datasets.
			 * @method displayActiveDataset
			 */
			$scope.displayActiveDataset = function() {
				var connection = connectionService.getActiveConnection();
				if(connection) {
					connectionService.loadMetadata(function() {
						var info = connectionService.getActiveDataset();
						$scope.databaseName = info.database;
						$scope.tableName = info.table;
						connection.getFieldNames($scope.tableName, function(results) {
							$scope.$apply(function() {
								$scope.fields = results;

								$scope.fields.splice(0, 0, "");

								$scope.queryForData();
							});
						});
					});
				}
			};

			$scope.queryForData = function() {
				var connection = connectionService.getActiveConnection();
				if(connection && $scope.groupFields.length > 0) {
					var query = $scope.buildQuery();

					XDATA.activityLogger.logSystemActivity('sunburst - query for data');
					connection.executeQuery(query, function(queryResults) {
						console.log("back");
						console.log(queryResults);
						XDATA.activityLogger.logSystemActivity('sunburst - received data');
						$scope.$apply(function() {
							doDrawChart(buildDataTree(queryResults));
							XDATA.activityLogger.logSystemActivity('sunburst - rendered data');
						});
					});
				}
			};

			var buildDataTree = function(data) {
				var nodes = {};
				var tree = {
					name: $scope.tableName,
					children: []
				};
				var leafObject;
				var nodeObject;
				var nodeKey;
				var nodeKeyString;

				var field;

				var i;
				data.data.forEach(function(doc) {
					var parent = tree;
					leafObject = {};
					nodeKey = {};
					for(i = 0; i < $scope.groupFields.length; i++) {
						field = $scope.groupFields[i];

						leafObject[field] = doc[field];
						nodeKey[field] = doc[field];
						nodeKey.name = field + ": " + doc[field];
						nodeKeyString = JSON.stringify(nodeKey);

						if(!nodes[nodeKeyString]) {
							if(i !== $scope.groupFields.length - 1) {
								nodeObject = {};
								nodeObject.name = field + ": " + doc[field];
								nodeObject.children = [];
								parent.children.push(nodeObject);
								parent = nodeObject;
								nodes[nodeKeyString] = nodeObject;
							} else {
								leafObject.name = field + ": " + doc[field];
								leafObject.count = doc.count;
								leafObject.total = doc[field];
								parent.children.push(leafObject);
							}
						} else {
							parent = nodes[nodeKeyString];
						}
					}
				});

				return tree;
			};

			var doDrawChart = function(data) {
				console.log(data);
				$scope.chart.clearData();
				$scope.chart.drawData(data);
			};

			neon.ready(function() {
				$scope.messenger = new neon.eventing.Messenger();
				initialize();
				$scope.displayActiveDataset();
			});

			$scope.addGroup = function() {
				if($scope.groupFields.indexOf($scope.selectedItem) === -1 && $scope.selectedItem !== "") {
					$scope.groupFields.push($scope.selectedItem);
				}
				$scope.selectedItem = "";
				$scope.queryForData();
			};

			$scope.dropGroup = function(groupField) {
				var index = $scope.groupFields.indexOf(groupField);
				if(index !== -1) {
					$scope.groupFields.splice(index, 1);
				}
				$scope.queryForData();
			};
		}
	};
}]);