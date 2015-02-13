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
'use strict';

/**
 * This directive is for building a tag cloud
 */
angular.module('neonDemo.directives')
.directive('tagCloud', ['ConnectionService', '$timeout', function(connectionService, $timeout) {
	return {
		templateUrl: 'partials/directives/tagCloud.html',
		restrict: 'EA',
		scope: {
			tagField: '='
		},
		link: function($scope, element) {
			element.addClass("tagcloud-container");
			$scope.databaseName = '';
			$scope.tableName = '';
			$scope.uniqueChartOptions = 'chart-options-' + uuid();
			var chartOptions = $(element).find('.chart-options');
			chartOptions.toggleClass($scope.uniqueChartOptions);

			// data will be a list of tag name/counts in descending order
			$scope.data = [];

			// optionsDisplayed is used merely to track the display of the options menu
			// for usability and workflow analysis.
			$scope.optionsDisplayed = false;

			$scope.filterTags = [];
			$scope.showFilter = false;
			$scope.andTags = true;

			/**
			 * Initializes the name of the directive's scope variables
			 * and the Neon Messenger used to monitor data change events.
			 * @method initialize
			 */
			$scope.initialize = function() {
				// Toggle the points and clusters view when the user toggles between them.
				$scope.$watch('andTags', function(newVal, oldVal) {
					XDATA.activityLogger.logUserActivity('TagCloud - user toggled tag combination', 'select_filter_menu_option',
						XDATA.activityLogger.WF_EXPLORE,
						{
							and: newVal,
							or: !newVal
						});
					if(newVal !== oldVal) {
						$scope.setTagFilter($scope.filterTags);
					}
				});

				// Log whenever the user toggles the options display.
				$scope.$watch('optionsDisplayed', function(newVal) {
					var action = (newVal === true) ? 'show_options' : 'hide_options';
					XDATA.activityLogger.logUserActivity('TagCloud - user toggled options display', action,
						XDATA.activityLogger.WF_EXPLORE);
				});

				$scope.filterKey = "tagcloud" + uuid();

				// Setup our messenger.
				$scope.messenger = new neon.eventing.Messenger();

				$scope.messenger.events({
					activeDatasetChanged: onDatasetChanged,
					filtersChanged: onFiltersChanged
				});

				$scope.$on('$destroy', function() {
					$scope.messenger.removeEvents();
					// Remove our filter if we had an active one.
					if (0 < $scope.filterTags.length) {
						$scope.messenger.removeFilter($scope.filterKey);
					}
				});

				// setup tag cloud color/size changes
				$.fn.tagcloud.defaults = {
					size: {
						start: 130,
						end: 250,
						unit: '%'
					},
					color: {
						start: '#aaaaaa',
						end: '#2f9f3e'
					}
				};

				$scope.$watchCollection('filterTags', $scope.setTagFilter);
			};

			/**
			 * Event handler for filter changed events issued over Neon's messaging channels.
			 * @param {Object} message A Neon filter changed message.
			 * @method onFiltersChanged
			 * @private
			 */
			var onFiltersChanged = function() {
				XDATA.activityLogger.logSystemActivity('TagCloud - received neon filter changed event');
				$scope.queryForTags();
			};

			/**
			 * Event handler for dataset changed events issued over Neon's messaging channels.
			 * @param {Object} message A Neon dataset changed message.
			 * @param {String} message.database The database that was selected.
			 * @param {String} message.table The table within the database that was selected.
			 * @method onDatasetChanged
			 * @private
			 */
			var onDatasetChanged = function(message) {
				XDATA.activityLogger.logSystemActivity('TagCloud - received neon dataset changed event');

				// if there is no active connection, try to make one.
				connectionService.connectToDataset(message.datastore, message.hostname, message.database, message.table);
				$scope.displayActiveDataset();
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
						// check if the field was passed in, otherwise check the mapping. if neither is found leave it empty
						$scope.tagField = $scope.tagField || connectionService.getFieldMapping("tags") || '';
						// Pull data.
						$scope.queryForTags();
					});
				}
			};

			/**
			 * Triggers a query that will aggregate the most popular tags in the tag cloud
			 * @method queryForTags
			 */
			$scope.queryForTags = function() {
				if($scope.tagField !== '') {
					var connection = connectionService.getActiveConnection();
					if(connection) {
						var host = connection.host_;
						var url = neon.serviceUrl('mongotagcloud', 'tagcounts', 'host=' + host + "&db=" + $scope.databaseName + "&collection=" + $scope.tableName + "&arrayfield=" + $scope.tagField + "&limit=40");

						XDATA.activityLogger.logSystemActivity('TagCloud - query for tag data');
						neon.util.ajaxUtils.doGet(url, {
							success: function(tagCounts) {
								XDATA.activityLogger.logSystemActivity('TagCloud - received tag data');
								$scope.$apply(function() {
									$scope.updateTagData(tagCounts);
									XDATA.activityLogger.logSystemActivity('TagCloud - rendered tag data');
								});
							},
							error: function() {
								XDATA.activityLogger.logSystemActivity('TagCloud - failed to receive tag data');
							}
						});
					}
				}
			};

			/**
			 * Updates the the tag cloud visualization.
			 * @param {Array} tagCounts An array of objects with "tag" and "count" properties for the tag
			 * name and number of occurrences.
			 * @method updateTagData
			 */
			$scope.updateTagData = function(tagCounts) {
				if($scope.andTags) {
					$scope.data = tagCounts.filter(function(elem) {
						return $scope.filterTags.indexOf(elem.tag) === -1;
					});
				} else {
					$scope.data = tagCounts;
				}

				// style the tags after they are displayed
				$timeout(function() {
					element.find('.tag').tagcloud();
				});
			};

			/**
			 * Ensures that the tag filter includes the argument, and updates the tag cloud if necessary.
			 * @param tagName {String} the tag that should be filtered on, e.g., "#lol"
			 * @method addTagFilter
			 */
			$scope.addTagFilter = function(tagName) {
				XDATA.activityLogger.logUserActivity('TagCloud - user added a tag as a filter', 'execute_visual_filter',
					XDATA.activityLogger.WF_EXPLORE,
					{
						tag: tagName
					});
				if($scope.filterTags.indexOf(tagName) === -1) {
					$scope.filterTags.push(tagName);
				}
			};

			/**
			 * Changes the filter to use the ones provided in the first argument.
			 * @param tagNames {Array} an array of tag strings, e.g., ["#lol", "#sad"]
			 * @param oldTagNames {Array} the old array of tag names
			 * @method setTagFilter
			 */
			$scope.setTagFilter = function(tagNames, oldTagNames) {
				if(tagNames !== oldTagNames) {
					if(tagNames.length > 0) {
						var tagFilter = $scope.createFilterForTags(tagNames);
						$scope.applyFilter(tagFilter);
					} else {
						$scope.clearTagFilters();
					}
				}
			};

			/**
			 * Creates a filter select object that has a where clause that "or"s all of the tags together
			 * @param tagNames {Array} an array of tag strings that records must have to pass the filter
			 * @returns {Object} a neon select statement
			 * @method createFilterForTags
			 */
			$scope.createFilterForTags = function(tagNames) {
				var filterClause;
				var filterClauses = tagNames.map(function(tagName) {
					return neon.query.where($scope.tagField, "=", tagName);
				});
				if($scope.andTags) {
					filterClause = filterClauses.length > 1 ? neon.query.and.apply(neon.query, filterClauses) : filterClauses[0];
				} else {
					filterClause = filterClauses.length > 1 ? neon.query.or.apply(neon.query, filterClauses) : filterClauses[0];
				}
				return new neon.query.Filter().selectFrom($scope.databaseName, $scope.tableName).where(filterClause);
			};

			/**
			 * Applies the specified filter and updates the visualization on success
			 * @param filter {Object} the neon filter to apply
			 * @method applyFilter
			 */
			$scope.applyFilter = function(filter) {
				XDATA.activityLogger.logSystemActivity('TagCloud - applying neon filter based on updated tag selections');
				$scope.messenger.replaceFilter($scope.filterKey, filter, function() {
					XDATA.activityLogger.logSystemActivity('TagCloud - applied neon filter');
					$scope.$apply(function() {
						$scope.queryForTags();
						// Show the Clear Filter button.
						$scope.showFilter = true;
						$scope.error = "";
						XDATA.activityLogger.logSystemActivity('TagCloud - rendered updated cloud');
					});
				}, function() {
					XDATA.activityLogger.logSystemActivity('TagCloud - failed to apply neon filter');
					// Notify the user of the error.
					$scope.error = "Error: Failed to apply the filter.";
				});
			};

			/**
			 * Removes the filter and updates.
			 * @method clearTagFilters
			 */
			$scope.clearTagFilters = function() {
				$scope.messenger.removeFilter($scope.filterKey, function() {
					$scope.$apply(function() {
						$scope.showFilter = false;
						$scope.filterTags = [];
						$scope.error = "";
						$scope.queryForTags();
					});
				}, function() {
					// Notify the user of the error.
					$scope.error = "Error: Failed to clear filter.";
				});
			};

			/**
			 * Remove a particular tag from the filter and update.
			 * @param tagName {String} the tag to remove from the filter, e.g., "#lol"
			 * @method removeFilter
			 */
			$scope.removeFilter = function(tagName) {
				XDATA.activityLogger.logUserActivity('TagCloud - user removed a tag as a filter', 'remove_visual_filter',
					XDATA.activityLogger.WF_EXPLORE,
					{
						tag: tagName
					});
				$scope.filterTags = _.without($scope.filterTags, tagName);
			};

			$scope.toggleOptionsDisplay = function() {
				$scope.optionsDisplayed = !$scope.optionsDisplayed;
			};

			// Wait for neon to be ready, the create our messenger and intialize the view and data.
			neon.ready(function() {
				$scope.initialize();
				$scope.displayActiveDataset();
			});
		}
	};
}]);
