window.onload = function() {
    document.querySelector('#add-google').addEventListener('click', function() {
      chrome.identity.getAuthToken({interactive: true}, function(token) {
        console.log("Token coming rigth up bro")
        console.log(token);
      });
    });
  };