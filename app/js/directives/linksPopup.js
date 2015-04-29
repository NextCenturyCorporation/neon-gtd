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
.directive('linksPopup', ['$sce', function($sce) {
    return {
        templateUrl: 'partials/directives/linksPopup.html',
        restrict: 'EA',
        scope: {
            linksArray: "=",
            linksIndex: "="
        },
        link: function($scope, $element) {
            $scope.SERVER = "SERVER";
            $scope.FIELD = "FIELD";
            $scope.VALUE = "VALUE";

            $scope.cleanLinksArray = [];
            $scope.links = [];

            $scope.$watch("linksArray", function(newValue, oldValue) {
                var cleanLinksArray = [];
                if($scope.linksArray && $scope.linksArray.length) {
                    for(var i = 0; i < $scope.linksArray.length; ++i) {
                        var cleanLinks = [];
                        var links = $scope.linksArray[i];
                        for(var j = 0; j < links.length; ++j) {
                            var link = links[j];
                            link.tab = link.data.query;
                            link.url = link.url.replace($scope.SERVER, link.data.server).replace($scope.VALUE, link.data.value);
                            // Notify angular that this is a trusted URL so angular will inject it into a form's action.
                            link.url = $sce.trustAsResourceUrl(link.url);
                            for(var k = 0; k < link.args.length; ++k) {
                                if(link.data.field) {
                                    link.args[k].value = link.args[k].value.replace($scope.FIELD, link.data.field);
                                }
                                if(link.data.value) {
                                    link.args[k].value = link.args[k].value.replace($scope.VALUE, link.data.value);
                                }
                            }
                            cleanLinks.push(link);
                        }
                        cleanLinksArray.push(cleanLinks);
                    }
                }
                $scope.cleanLinksArray = cleanLinksArray;
            });

            $scope.$watch("linksIndex", function() {
                if($scope.cleanLinksArray && $scope.cleanLinksArray.length && $scope.linksIndex >= 0) {
                    $scope.links = $scope.cleanLinksArray[$scope.linksIndex];
                }
            });
        }
    };
}]);
