'use strict';

/*
 * Copyright 2015 Next Century Corporation
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
.directive('newsfeed', ['ConnectionService', 'DatasetService', 'ErrorNotificationService',
function(connectionService, datasetService, errorNotificationService) {
    return {
        templateUrl: 'partials/directives/newsfeed.html',
        restrict: 'EA',
        scope: {
            bindTitle: '=',
            bindDatabase: '=',
            bindTable: '=',
            bindHeadField: '=',
            bindNameField: '=',
            bindDateField: '=',
            bindTextField: '=',
            bindFeedName: '=',
            bindFeedType: '='
        },
        link: function($scope, $element) {
            $element.addClass('newsfeed-directive');

            $scope.element = $element;

            $scope.ASCENDING = neon.query.ASCENDING;
            $scope.DESCENDING = neon.query.DESCENDING;

            var DEFAULT_TYPE = "TWITTER";

            $scope.feedName = $scope.bindFeedName || "";
            $scope.feedType = $scope.bindFeedType || DEFAULT_TYPE;
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.selectedDate = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.loadingNews = false;

            $scope.data = {
                news: [],
                newsSubset: [],
                type: undefined,
                show: {
                    heads: [],
                    names: []
                },
                highlights: {
                    heads: [],
                    names: []
                }
            };

            $scope.options = {
                database: {},
                table: {},
                headField: {},
                nameField: {},
                dateField: {},
                textField: {},
                sortDirection: neon.query.ASCENDING
            };

            $scope.optionsMenuButtonText = function() {
                if($scope.data.newsSubset.length) {
                    if($scope.data.newsSubset.length < $scope.data.news.length) {
                        return $scope.data.newsSubset.length + " of " + $scope.data.news.length;
                    }
                    return $scope.data.newsSubset.length;
                }
                return "No News";
            };
            $scope.showOptionsMenuButtonText = function() {
                return true;
            };

            /**
             * Initializes the visualization.
             * @method initialize
             * @private
             */
            var initialize = function() {
                $scope.messenger = new neon.eventing.Messenger();
                $scope.messenger.events({
                    filtersChanged: onFiltersChanged
                });
                $scope.messenger.subscribe("news", onNews);
                $scope.messenger.subscribe("news_highlights", onNewsHighlights);
                $scope.messenger.subscribe("date_selected", onDateSelected);
                $scope.messenger.subscribe(datasetService.UPDATE_DATA_CHANNEL, function() {
                    queryForData();
                });

                handleResize();
                $element.resize(handleResize);
                $element.find(".newsfeed").scroll(handleScroll);

                $scope.$on('$destroy', function() {
                    $scope.messenger.removeEvents();
                    $element.off("resize", handleResize);
                    $element.off("scroll", handleScroll);
                });
            };

            var handleResize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $element.find(".newsfeed").height($element.height() - headerHeight);
            };

            var handleScroll = function() {
                if(!$scope.loadingNews) {
                    if($element.find(".item").last().position().top <= $element.height()) {
                        $scope.loadingNews = true;
                        $scope.$apply(function() {
                            $scope.data.newsSubset = $scope.data.newsSubset.concat($scope.data.news.slice($scope.data.newsSubset.length, $scope.data.newsSubset.length + 100));
                            $scope.loadingNews = false;
                        });
                    }
                }
            };

            /**
             * Event handler for filter changed events issued over Neon's messaging channels.
             * @param {Object} message A Neon filter changed message.
             * @method onFiltersChanged
             * @private
             */
            var onFiltersChanged = function(message) {
                if(message.addedFilter && message.addedFilter.databaseName === $scope.options.database.name && message.addedFilter.tableName === $scope.options.table.name) {
                    queryForData();
                }
            };

            /**
             * Event handler for news events issued over Neon's messaging channels.
             * @param {Object} message A Neon news message.
             * @method onNews
             * @private
             */
            var onNews = function(message) {
                if(message.news && message.name && message.name === $scope.feedName) {
                    $scope.data.news = message.news;
                    $scope.data.newsSubset = message.news;
                    $scope.data.type = (message.type || $scope.feedType).toUpperCase();
                }
            };

            /**
             * Event handler for news highlights events issued over Neon's messaging channels.
             * @param {Object} message A Neon news highlights message.
             * @method onNewsHighlights
             * @private
             */
            var onNewsHighlights = function(message) {
                if(message.name && message.name === $scope.feedName) {
                    if(message.show) {
                        $scope.data.show.heads = message.show.heads || [];
                        $scope.data.show.names = message.show.names || [];
                    }
                    if(message.highlights) {
                        $scope.data.highlights.heads = message.highlights.heads || [];
                        $scope.data.highlights.names = message.highlights.names || [];
                    }
                }
            };

            /**
             * Event handler for date selected events issued over Neon's messaging channels.
             * @param {Object} message A Neon date selected message.
             * @method onDateSelected
             * @private
             */
            var onDateSelected = function(message) {
                $scope.selectedDate = message.end;
            };

            /**
             * Displays data for any currently active datasets.
             * @param {Boolean} Whether this function was called during visualization initialization.
             * @method displayActiveDataset
             * @private
             */
            var displayActiveDataset = function(initializing) {
                if(!datasetService.hasDataset() || $scope.loadingData) {
                    return;
                }

                $scope.databases = datasetService.getDatabases();
                $scope.options.database = $scope.databases[0];
                if($scope.bindDatabase) {
                    for(var i = 0; i < $scope.databases.length; ++i) {
                        if($scope.bindDatabase === $scope.databases[i].name) {
                            $scope.options.database = $scope.databases[i];
                            break;
                        }
                    }
                }

                if(initializing) {
                    $scope.updateTables();
                } else {
                    $scope.$apply(function() {
                        $scope.updateTables();
                    });
                }
            };

            /**
             * Updates the list of available tables and the default table to use in this visualization from the tables in the active dataset.
             * @method updateTables
             */
            $scope.updateTables = function() {
                $scope.tables = datasetService.getTables($scope.options.database.name);
                $scope.options.table = $scope.tables[0];
                if($scope.bindTable) {
                    for(var i = 0; i < $scope.tables.length; ++i) {
                        if($scope.bindTable === $scope.tables[i].name) {
                            $scope.options.table = $scope.tables[i];
                            break;
                        }
                    }
                }

                $scope.updateFields();
            };

            /**
             * Updates the list of available fields and the default fields to use in this visualization from the fields in the active dataset.
             * @method updateFields
             */
            $scope.updateFields = function() {
                // Prevent extraneous queries from onFieldChanged.
                $scope.loadingData = true;

                $scope.fields = datasetService.getSortedFields($scope.options.database.name, $scope.options.table.name);
                var headFieldName = $scope.bindHeadField || "";
                $scope.options.headField = _.find($scope.fields, function(field) {
                    return field.columnName === headFieldName;
                }) || datasetService.createBlankField();
                var nameFieldName = $scope.bindNameField || "";
                $scope.options.nameField = _.find($scope.fields, function(field) {
                    return field.columnName === nameFieldName;
                }) || datasetService.createBlankField();
                var dateFieldName = $scope.bindDateField || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "date") || "";
                $scope.options.dateField = _.find($scope.fields, function(field) {
                    return field.columnName === dateFieldName;
                }) || datasetService.createBlankField();
                var textFieldName = $scope.bindTextField || "";
                $scope.options.textField = _.find($scope.fields, function(field) {
                    return field.columnName === textFieldName;
                }) || datasetService.createBlankField();

                $scope.feedName = $scope.bindFeedName || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_name") || "";
                $scope.feedType = $scope.bindFeedType || datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_type") || DEFAULT_TYPE;

                queryForData();
            };

            /**
             * Query for data to display in this visualization using the Neon Connection.
             * @method queryForData
             * @private
             */
            var queryForData = function() {
                if($scope.errorMessage) {
                    errorNotificationService.hideErrorMessage($scope.errorMessage);
                    $scope.errorMessage = undefined;
                }

                var connection = connectionService.getActiveConnection();

                if(!connection || !datasetService.isFieldValid($scope.options.dateField) || !datasetService.isFieldValid($scope.options.textField)) {
                    updateData([]);
                    $scope.loadingData = false;
                    return;
                }

                var query = buildQuery();

                connection.executeQuery(query, function(results) {
                    $scope.$apply(function() {
                        updateData(results.data);
                        $scope.loadingData = false;
                    });
                }, function(response) {
                    updateData([]);
                    $scope.loadingData = false;
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Builds the query for this visualization.
             * @method buildQuery
             * @return {neon.query.Query}
             * @private
             */
            var buildQuery = function() {
                var fields = [$scope.options.dateField.columnName, $scope.options.textField.columnName];
                if(datasetService.isFieldValid($scope.options.headField)) {
                    fields.push($scope.options.headField.columnName);
                }
                if(datasetService.isFieldValid($scope.options.nameField)) {
                    fields.push($scope.options.nameField.columnName);
                }

                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields)
                    .sortBy($scope.options.dateField.columnName, $scope.options.sortDirection)

                return query;
            };

            /**
             * Updates this visualization to display the given query result data.
             * @param {Array} data The query result data containing {Object} data rows mapping column name to value.
             * @method updateData
             * @private
             */
            var updateData = function(data) {
                $scope.data.news = [];
                data.forEach(function(item) {
                    $scope.data.news.push({
                        head: datasetService.isFieldValid($scope.options.headField) ? item[$scope.options.headField.columnName] : "",
                        name: datasetService.isFieldValid($scope.options.nameField) ? item[$scope.options.nameField.columnName] : "",
                        date: new Date(item[$scope.options.dateField.columnName]),
                        text: item[$scope.options.textField.columnName]
                    });
                });
                $scope.data.newsSubset = $scope.data.news.slice(0, 100);
            };

            /**
             * Triggered by changing a field in the options menu.
             */
            $scope.onFieldChanged = function() {
                if(!$scope.loadingData) {
                    queryForData();
                }
            };

            /**
             * Triggered by clicking the sort-by-date-ascending button.
             */
            $scope.handleAscButtonClick = function() {
                if($scope.options.sortDirection === $scope.ASCENDING) {
                    queryForData();
                }
            };

            /**
             * Triggered by clicking the sort-by-date-descending button.
             */
            $scope.handleDescButtonClick = function() {
                if($scope.options.sortDirection === $scope.DESCENDING) {
                    queryForData();
                }
            };

            /**
             * Returns the style class for the given news item.
             * @param {Object} item
             * @method getNewsItemStyleClass
             * @return {String}
             */
            $scope.getNewsItemStyleClass = function(item) {
                var style = [];
                if($scope.selectedDate && item.date.getTime() > $scope.selectedDate.getTime()) {
                    style.push("future");
                }
                if($scope.data.highlights.heads.length || $scope.data.highlights.names.length) {
                    if($scope.data.highlights.heads.indexOf(item.head) >= 0 || $scope.data.highlights.names.indexOf(item.name) >= 0) {
                        style.push("highlight");
                    }
                }
                if($scope.data.show.heads.length || $scope.data.show.names.length) {
                    if($scope.data.show.heads.indexOf(item.head) < 0 && $scope.data.show.names.indexOf(item.name) < 0) {
                        style.push("hidden");
                    }
                }
                return style.join(" ");
            };

            neon.ready(function() {
                initialize();
                displayActiveDataset(true);
            });
        }
    };
}]);
