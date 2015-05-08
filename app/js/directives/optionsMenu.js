angular.module('neonDemo.directives')
.directive('optionsMenu', function() {

    return {
        templateUrl: 'partials/directives/optionsMenu.html',
        restrict: 'EA',
        transclude: true, 
        link: function($scope, element) {
            $scope.optionsDisplayed = false;
            $scope.uniqueVisualizationOptions = 'visualization-options-' + uuid();

            var options = $(element).find('.visualization-options');
            options.toggleClass($scope.uniqueVisualizationOptions);

            $scope.toggleOptionsDisplay = function(){
                $scope.optionsDisplayed = !$scope.optionsDisplayed;
                var activity = ($scope.optionsDisplayed) ? 'show' : 'hide';
                console.log(activity)
                XDATA.userALE.log({
                    activity: activity,
                    action: "click",
                    elementId: $scope.uniqueVisualizationOptions,
                    elementType: "button",
                    elementGroup: "top",
                    source: "user",
                    tags: ["options"]
                });
            }

            $scope.$watch('tagField', function() {
                console.log("options - tagField changed");
            })
        }
    }
});
