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

angular.module("neonDemo.directives")
.directive("annotations", ["$http", "AnnotationService", function($http, annotationService) {
    return {
        templateUrl: "partials/directives/annotations.html",
        restrict: "EA",
        scope: {
            bindData: "@"
        },
        link: function($scope) {
            $scope.ID = "id";
            $scope.SENTIMENT = "sentiment";

            var createString = function(key, value) {
                value = value || $scope.data[key].value;
                return $scope.data[key] ? $scope.data[key].prefix + value + $scope.data[key].suffix : "";
            };

            var updateAnnotations = function() {
                $scope.data = {};
                var data = $scope.bindData ? JSON.parse($scope.bindData) : {};
                Object.keys(data).forEach(function(key) {
                    $scope.data[key] = {
                        prefix: (_.isObject(data[key]) ? data[key].prefix : undefined) || "",
                        suffix: (_.isObject(data[key]) ? data[key].suffix : undefined) || "",
                        value: (_.isObject(data[key]) ? data[key].value : data[key]).toLowerCase(),
                        annotated: false
                    };
                });

                if($scope.data[$scope.ID] && $scope.data[$scope.ID].value) {
                    $http.get(annotationService.URL + "/" + createString($scope.ID)).then(function(response) {
                        response.data.forEach(function(item) {
                            $scope.data[item[annotationService.KEY]].value = item[annotationService.VALUE];
                            $scope.data[item[annotationService.KEY]].annotated = true;
                        });
                    });
                }
            };

            $scope.$watch("bindData", function() {
                updateAnnotations();
            });

            updateAnnotations();

            /**
             * Updates the sentiment for the ID in the scope data to the given value.
             * @param {String} value
             * @method updateSentiment
             */
            $scope.updateSentiment = function(value) {
                var postData = {};
                postData[annotationService.ID] = createString($scope.ID);
                postData[annotationService.KEY] = $scope.SENTIMENT;
                postData[annotationService.VALUE] = createString($scope.SENTIMENT, value);
                if(annotationService.USER) {
                    postData[annotationService.USER] = "Neon-Test";
                }
                $http.post(annotationService.URL, postData);
                $scope.data[$scope.SENTIMENT].annotated = true;
            };
        }
    };
}]);
