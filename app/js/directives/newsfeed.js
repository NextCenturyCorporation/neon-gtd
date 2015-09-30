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
            var LIMIT_INTERVAL = 100;

            $scope.feedName = $scope.bindFeedName || "";
            $scope.feedType = $scope.bindFeedType ? $scope.bindFeedType.toUpperCase() : DEFAULT_TYPE;
            $scope.databases = [];
            $scope.tables = [];
            $scope.fields = [];
            $scope.selectedDate = undefined;
            $scope.errorMessage = undefined;
            $scope.loadingData = false;
            $scope.loadingNews = false;

            $scope.data = {
                news: [],
                newsCount: 0,
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
                sortDirection: neon.query.ASCENDING,
                limit: LIMIT_INTERVAL
            };

            $scope.optionsMenuButtonText = function() {
                if($scope.data.news.length) {
                    if($scope.data.news.length < $scope.data.newsCount) {
                        return $scope.data.news.length + " of " + $scope.data.newsCount + " Items";
                    }
                    return $scope.data.news.length + " Items";
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
                    resetAndQueryForData();
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

            /**
             * Handles resize events for this visualization.
             * @method handleResize
             * @private
             */
            var handleResize = function() {
                var headerHeight = 0;
                $element.find(".header-container").each(function() {
                    headerHeight += $(this).outerHeight(true);
                });
                $element.find(".newsfeed").height($element.height() - headerHeight);
            };

            /**
             * Handles scroll events for the newsfeed in this visualization.
             * @method handleScroll
             * @private
             */
            var handleScroll = function() {
                if(!$scope.loadingNews) {
                    if($element.find(".item").last().position().top <= $element.height()) {
                        $scope.loadingNews = true;
                        $scope.options.limit = $scope.options.limit + LIMIT_INTERVAL;
                        queryForData(function(data) {
                            updateData(data.slice($scope.options.limit - LIMIT_INTERVAL, $scope.options.limit));
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
                    resetAndQueryForData();
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
                    $scope.data.newsCount = message.news.length;
                    $scope.feedType = (message.type || $scope.feedType).toUpperCase();
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
                $scope.feedType = $scope.bindFeedType ? $scope.bindFeedType.toUpperCase() : datasetService.getMapping($scope.options.database.name, $scope.options.table.name, "newsfeed_type") || DEFAULT_TYPE;

                resetAndQueryForData();
            };

            /**
             * Clear the data and query for new data to display in this visualization using the Neon Connection.
             * @method resetAndQueryForData
             * @private
             */
            var resetAndQueryForData = function() {
                $scope.data.news = [];
                queryForData(function(data, connection) {
                    updateData(data);
                    $scope.loadingData = false;
                    queryForNewsCount(connection);
                });
            };

            /**
             * Query for data to display in this visualization using the Neon Connection.
             * @param {Function} callback
             * @method resetAndQueryForData
             * @private
             */
            var queryForData = function(callback) {
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
                        callback(results.data, connection);
                    });
                }, function(response) {
                    $scope.$apply(function() {
                        callback([], connection);
                    });
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

                return new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).withFields(fields)
                    .sortBy($scope.options.dateField.columnName, $scope.options.sortDirection)
                    .limit($scope.options.limit);
            };

            /**
             * Updates this visualization to display the given query result data.
             * @param {Array} data The query result data containing {Object} data rows mapping column name to value.
             * @method updateData
             * @private
             */
            var updateData = function(data) {
                data.forEach(function(item) {
                    $scope.data.news.push({
                        head: datasetService.isFieldValid($scope.options.headField) ? item[$scope.options.headField.columnName] : "",
                        name: datasetService.isFieldValid($scope.options.nameField) ? item[$scope.options.nameField.columnName] : "",
                        date: new Date(item[$scope.options.dateField.columnName]),
                        text: item[$scope.options.textField.columnName]
                    });
                });
            };

            /**
             * Query for the unlimited count of news data to display in this visualization using the given Neon Connection.
             * @param {Object} connection
             * @method queryForNewsCount
             * @private
             */
            var queryForNewsCount = function(connection) {
                var query = new neon.query.Query().selectFrom($scope.options.database.name, $scope.options.table.name).aggregate(neon.query.COUNT, "*", "count");

                connection.executeQuery(query, function(results) {
                    $scope.$apply(function() {
                        $scope.data.newsCount = results.data[0].count;
                    });
                }, function(response) {
                    $scope.$apply(function() {
                        $scope.data.newsCount = 0;
                    });
                    if(response.responseJSON) {
                        $scope.errorMessage = errorNotificationService.showErrorMessage($element, response.responseJSON.error, response.responseJSON.stackTrace);
                    }
                });
            };

            /**
             * Triggered by changing a field in the options menu.
             */
            $scope.onFieldChanged = function() {
                if(!$scope.loadingData) {
                    resetAndQueryForData();
                }
            };

            /**
             * Triggered by clicking the sort-by-date-ascending button.
             */
            $scope.handleAscButtonClick = function() {
                if($scope.options.sortDirection === $scope.ASCENDING) {
                    resetAndQueryForData();
                }
            };

            /**
             * Triggered by clicking the sort-by-date-descending button.
             */
            $scope.handleDescButtonClick = function() {
                if($scope.options.sortDirection === $scope.DESCENDING) {
                    resetAndQueryForData();
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
